// deno-lint-ignore-file no-explicit-any
//
// Phase 1 of the global hi-tech pipeline: scan → dedupe → rank → enqueue.
//
// Deliberately does no writing of articles. It finishes in seconds and leaves a
// short queue behind, which `ingest-worker` drains one story at a time. Doing
// both here would blow the function's wall-clock limit on the third article.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  authorize,
  callModelWithFallback,
  corsHeaders,
  fetchFeed,
  json,
  loadCategoryStats,
  loadStats,
  toolArgs,
  topUpCount,
  urlKey,
  type FeedItem,
} from "../_shared/ingest.ts";

type Source = {
  id: string;
  name: string;
  feed_url: string;
  weight: number;
  first_failed_at: string | null;
};

type Candidate = FeedItem & {
  key: string;
  sourceName: string;
  weight: number;
};

const DEFAULT_LOOKBACK_HOURS = 24;
/** How many stories the ranker is shown. Keeps the prompt inside a sane budget. */
const MAX_RANKED = 60;

function hoursAgo(iso: string | null): number {
  if (!iso) return 0;
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const startedAt = Date.now();
  const supabase = adminClient();
  const notes: string[] = [];

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    // --- 0. How much is still missing from each category's target ----------
    // The daily target lives in ingest_config, not in this file, so it can be
    // changed from the admin panel without a redeploy. It is a PER-CATEGORY
    // number: every active category is topped up toward its own quota, so one
    // busy category can never starve the others.
    const stats = await loadStats(supabase);
    const categoryStats = await loadCategoryStats(supabase);
    const lookbackHours = Math.min(
      Math.max(Number(body?.lookbackHours) || stats.lookbackHours || DEFAULT_LOOKBACK_HOURS, 2),
      96,
    );
    const wantedByBucket = new Map<string, number>();
    for (const cat of categoryStats) {
      const want = topUpCount(cat, stats.dailyTarget, stats.queueBuffer);
      if (want > 0) wantedByBucket.set(cat.bucket, want);
    }
    // An explicit limit (an old caller passing one) still caps the grand total.
    const totalWanted = [...wantedByBucket.values()].reduce((a, b) => a + b, 0);
    const limit = body?.limit
      ? Math.min(Math.max(Number(body.limit), 1), totalWanted || Number(body.limit))
      : totalWanted;

    // Nothing to do: every category met its target and holds spares. Returning
    // before touching the feeds is what makes six scans a day cheap.
    if (!dryRun && limit === 0) {
      return json({
        ok: true,
        skipped: "היעד היומי הושלם בכל הקטגוריות",
        publishedToday: stats.publishedToday,
        dailyTarget: stats.dailyTarget,
        queued: stats.queued,
      });
    }

    // --- 0b. Quota-completion escalation ------------------------------------
    // A category falling behind its daily quota gets more aggressive treatment
    // as the (Israel-local) day runs out, so the day ends full on its own:
    //   level 1 — afternoon, under half quota:  look 48h back, ranker less picky
    //   level 2 — evening, quota still unmet:   look 72h back, ranker fills the
    //             quota, and stories earlier scans passed on return to the table.
    // The quality floor stays: the ranker still rejects junk, and the worker
    // still refuses to write when the source material is too thin.
    const israelHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        hour: "numeric",
        hour12: false,
      }).format(new Date()),
    );
    const escalation = new Map<string, 1 | 2>();
    for (const cat of categoryStats) {
      if (!wantedByBucket.has(cat.bucket)) continue;
      const onHand = cat.publishedToday + cat.queued;
      if (israelHour >= 17 && onHand < stats.dailyTarget) escalation.set(cat.bucket, 2);
      else if (israelHour >= 13 && onHand < Math.ceil(stats.dailyTarget / 2)) escalation.set(cat.bucket, 1);
    }
    // Sources carry no category anymore, so the feed window is shared: the
    // deepest escalated category widens it for the whole scan.
    const feedLookback = Math.max(
      lookbackHours,
      ...[...escalation.values()].map((level) => (level === 2 ? 72 : 48)),
      0,
    );
    for (const [bucket, level] of escalation) {
      notes.push(`השלמת מכסה: ${bucket} בפיגור — רמה ${level}, ${feedLookback} שעות אחורה`);
    }

    // --- 1. Active sources -------------------------------------------------
    // Sources are one flat pool — every active feed is read, and the ranker
    // files each picked story under a category by itself.
    const { data: sources, error: srcErr } = await supabase
      .from("news_sources")
      .select("id, name, feed_url, weight, first_failed_at")
      .eq("is_active", true);
    if (srcErr) throw new Error(`טעינת מקורות נכשלה: ${srcErr.message}`);
    if (!sources?.length) return json({ error: "אין מקורות פעילים" }, 400);

    // --- 2. Fetch every feed in parallel -----------------------------------
    const fetched = await Promise.all(
      (sources as Source[]).map(async (s) => ({ source: s, result: await fetchFeed(s.feed_url) })),
    );

    const perSource: { name: string; ok: boolean; items: number; error?: string }[] = [];
    const candidates: Candidate[] = [];
    let sourcesOk = 0;
    let sourcesFailed = 0;

    for (const { source, result } of fetched) {
      if (!result.ok) {
        sourcesFailed++;
        perSource.push({ name: source.name, ok: false, items: 0, error: result.error });
        notes.push(`${source.name}: ${result.error}`);
        // A feed that has answered nothing but errors for two straight weeks
        // is dead — switch it off so it stops weighing on every scan. The
        // panel and the daily digest both surface the shutdown.
        const failingSince = source.first_failed_at ? Date.parse(source.first_failed_at) : Date.now();
        const deadFor14Days = Date.now() - failingSince > 14 * 24 * 3600_000;
        await supabase
          .from("news_sources")
          .update({
            last_fetched_at: new Date().toISOString(),
            last_status: result.error,
            last_item_count: 0,
            first_failed_at: source.first_failed_at ?? new Date().toISOString(),
            ...(deadFor14Days ? { is_active: false, auto_disabled_at: new Date().toISOString() } : {}),
          })
          .eq("id", source.id);
        if (deadFor14Days) notes.push(`המקור ${source.name} כובה אוטומטית — נכשל ברצף 14 יום`);
        continue;
      }
      sourcesOk++;
      // A feed with no dates at all still gets in — its items are simply
      // treated as "now" and the URL ledger keeps them from repeating.
      // The window widens for the whole scan when a category is behind quota.
      const fresh = result.items.filter(
        (it) => !it.publishedAt || hoursAgo(it.publishedAt) <= feedLookback,
      );
      perSource.push({ name: source.name, ok: true, items: fresh.length });
      await supabase
        .from("news_sources")
        .update({ last_fetched_at: new Date().toISOString(), last_status: "ok", last_item_count: fresh.length, first_failed_at: null })
        .eq("id", source.id);

      for (const it of fresh) {
        candidates.push({
          ...it,
          key: urlKey(it.link),
          sourceName: source.name,
          weight: source.weight,
        });
      }
    }

    // --- 3. Dedupe inside the run, then against the ledger ------------------
    const byKey = new Map<string, Candidate>();
    for (const c of candidates) {
      const existing = byKey.get(c.key);
      // Same URL from two feeds: keep the one from the more trusted outlet.
      if (!existing || c.weight > existing.weight) byKey.set(c.key, c);
    }
    const unique = [...byKey.values()];

    // Two kinds of "already know this URL": rows that went somewhere (pending,
    // published, failed, skipped) are blocked forever; rows the ranker merely
    // passed on (`seen`) are blocked normally, but return to the table for a
    // category in quota-completion mode — yesterday's second-tier story is
    // better than an unmet quota.
    const blocked = new Set<string>();
    const seenOnly = new Set<string>();
    const keys = unique.map((c) => c.key);
    for (let i = 0; i < keys.length; i += 150) {
      const { data } = await supabase
        .from("ingest_items")
        .select("url_key, status")
        .in("url_key", keys.slice(i, i + 150));
      for (const row of (data || []) as { url_key: string; status: string }[]) {
        if (row.status === "seen") seenOnly.add(row.url_key);
        else blocked.add(row.url_key);
      }
    }
    const fresh = unique.filter(
      (c) => !blocked.has(c.key) && (!seenOnly.has(c.key) || escalation.size > 0),
    );

    if (dryRun) {
      return json({
        dryRun: true,
        sources: perSource,
        itemsSeen: unique.length,
        itemsNew: fresh.length,
        sample: fresh.slice(0, 15).map((c) => ({ source: c.sourceName, title: c.title, url: c.link })),
      });
    }

    if (fresh.length === 0) {
      await supabase.from("ingest_runs").insert({
        kind: "scan",
        trigger: auth.trigger,
        sources_ok: sourcesOk,
        sources_failed: sourcesFailed,
        items_seen: unique.length,
        items_new: 0,
        items_queued: 0,
        notes,
        duration_ms: Date.now() - startedAt,
      });
      return json({ ok: true, itemsSeen: unique.length, itemsNew: 0, queued: 0, sources: perSource });
    }

    // --- 4. Shortlist for the ranker ---------------------------------------
    const shortlist = [...fresh]
      .sort((a, b) => b.weight - a.weight || hoursAgo(a.publishedAt) - hoursAgo(b.publishedAt))
      .slice(0, MAX_RANKED);

    // Articles already on the site: the ranker skips stories we ran — unless
    // a candidate is a genuine DEVELOPMENT of one of them, in which case it
    // marks it as an update (update_of) instead of a fresh piece.
    const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
    const { data: recentArticles } = await supabase
      .from("articles")
      .select("id, title")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    const covered = (recentArticles || []) as { id: string; title: string }[];

    const listing = shortlist
      .map(
        (c, i) =>
          `[${i}] (${c.sourceName}${c.publishedAt ? ` · לפני ${hoursAgo(c.publishedAt).toFixed(1)} שעות` : ""})\n` +
          `כותרת: ${c.title}\n` +
          `תקציר: ${(c.summary || "—").slice(0, 300)}`,
      )
      .join("\n\n");

    // Sources carry no category — the ranker files each pick itself, and it
    // sees each category's live name and remaining budget.
    const budgetLines = categoryStats
      .filter((c) => wantedByBucket.has(c.bucket))
      .map((c) => {
        const base = `- ${c.name}: עד ${wantedByBucket.get(c.bucket)} ידיעות`;
        return escalation.has(c.bucket)
          ? `${base} — מצב השלמת מכסה: היום מתקרב לסופו והקטגוריה בפיגור. מלא את המכסה גם בידיעות בסדר גודל בינוני; פסול רק תוכן שיווקי או זבל של ממש.`
          : base;
      })
      .join("\n");
    const categoryNamesList = categoryStats.map((c) => c.name).join(", ");

    const rankerSystem = `אתה עורך חדשות ראשי של אתר הייטק ישראלי בעברית. קיבלת רשימת כתבות שפורסמו היום באתרי הטכנולוגיה הגדולים בעולם. בחר את הידיעות **הכי חשובות ורלוונטיות לקהל הישראלי** לפרסום.

אתה גם המסווג: לכל ידיעה שנבחרה קבע בעצמך את הקטגוריה המתאימה ביותר באתר, לפי תוכן הידיעה בלבד.

מכסה לכל קטגוריה:
${budgetLines}

קריטריונים לבחירה:
- השפעה אמיתית: מוצר חדש משמעותי, מודל AI חדש, מיזוג/רכישה, גיוס ענק, רגולציה, פריצת דרך טכנולוגית, קריסה או משבר בחברה גדולה.
- רלוונטיות לישראל: חברות עם מרכזי פיתוח בישראל, משקיעים ישראלים, סטארטאפים ישראלים, טכנולוגיה שמשפיעה על שוק העבודה בהייטק הישראלי — קבלו עדיפות.
- עניין לקורא: משהו שקורא הייטק ישראלי ירצה לדעת עליו הבוקר.

עדכונים לכתבות קיימות:
- אם ידיעה מועמדת היא **המשך או התפתחות אמיתית** של כתבה שכבר באתר (רשימה מצורפת, כל אחת עם [U-מספר]) ויש בה מידע חדש מהותי — בחר אותה וסמן update_of עם המספר של הכתבה הקיימת. היא תתווסף ככתבת עדכון לכתבה הקיימת, לא תיפתח כתבה חדשה.
- אם היא רק חוזרת על מה שכבר נכתב — אל תבחר אותה בכלל.

מה **לא** לבחור:
- ידיעות שחוזרות על מה שכבר מכוסה באתר בלי חדש (רשימת הכותרות האחרונות מצורפת).
- כפילויות: אם שתי ידיעות מספרות את אותו הסיפור, בחר רק אחת — את זו מהמקור האמין יותר.
- תוכן שיווקי, מבצעי קניות, ביקורות גאדג'טים שוליות, רשימות "10 הכי טובים".
- ידיעות שהן בעיקר דעה או פרשנות אישית בלי חדשות אמיתיות.

גוון את הבחירה: אל תיקח את כל הידיעות מאותו מקור או מאותו נושא.

עבור כל בחירה החזר גם:
- priority: 1-10, כמה חשוב לפרסם את זה (10 = ידיעה מובילה).
- angle: משפט אחד בעברית — הזווית שבה כדאי לכתוב את הכתבה לקורא הישראלי.
- category: הקטגוריה שבחרת לידיעה — אחת מ: ${categoryNamesList}.
- update_of (רק לעדכון): המספר של הכתבה הקיימת מרשימת ה-[U].

אם בקטגוריה מסוימת אין מספיק ידיעות ראויות — החזר פחות ממכסתה. עדיף לא לפרסם מאשר לפרסם זבל.`;

    const ranked = await callModelWithFallback({
      messages: [
        { role: "system", content: rankerSystem },
        {
          role: "user",
          content:
            `כתבות שכבר פורסמו באתר ב-72 השעות האחרונות:\n${covered.map((a, i) => `[U${i}] ${a.title}`).join("\n") || "— אין —"}\n\n` +
            `=== ידיעות מועמדות ===\n\n${listing}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "select_stories",
            description: "בוחר את הידיעות שראויות לפרסום",
            parameters: {
              type: "object",
              properties: {
                picks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "integer", description: "המספר בסוגריים המרובעים של הידיעה" },
                      priority: { type: "integer", description: "1-10" },
                      angle: { type: "string", description: "משפט אחד בעברית: הזווית לכתבה" },
                      category: { type: "string", description: "קטגוריה בעברית" },
                      update_of: { type: "integer", description: "מספר U של כתבה קיימת — רק כשזו התפתחות שלה" },
                    },
                    required: ["index", "priority", "angle", "category"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["picks"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "select_stories" } },
    });

    const picks: { index: number; priority: number; angle: string; category: string; update_of?: number }[] =
      (toolArgs(ranked).picks as any[]) || [];

    // Enforce the per-category budgets in code: the ranker's own category
    // choice decides which budget a pick spends; the strongest picks win
    // their category's slots and whatever was over-picked is dropped. A
    // category name the model invented falls back to any category that still
    // has budget — better than dropping a good story.
    const bucketByName = new Map(categoryStats.map((c) => [c.name, c.bucket]));
    const chosen = new Map<number, { priority: number; angle: string; category: string; bucket: string | null; updateOf: string | null }>();
    const usedByBucket = new Map<string, number>();
    const hasRoom = (b: string) => (usedByBucket.get(b) ?? 0) < (wantedByBucket.get(b) ?? 0);
    const validPicks = picks
      .filter((p) => Number.isInteger(p.index) && p.index >= 0 && p.index < shortlist.length)
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    let updatesTaken = 0;
    for (const p of validPicks) {
      // An update rides on an existing article: it spends no category budget
      // and no daily quota, capped at 3 per scan so a noisy day cannot turn
      // one story into an endless append-chain.
      const updateTarget = Number.isInteger(p.update_of) && p.update_of! >= 0 && p.update_of! < covered.length
        ? covered[p.update_of!]
        : null;
      if (updateTarget) {
        if (updatesTaken >= 3 || chosen.has(p.index)) continue;
        updatesTaken++;
        chosen.set(p.index, {
          priority: Math.min(Math.max(Number(p.priority) || 5, 1), 10),
          angle: String(p.angle || "").slice(0, 500),
          category: String(p.category || "").slice(0, 40),
          bucket: null,
          updateOf: updateTarget.id,
        });
        continue;
      }
      if (chosen.size - updatesTaken >= limit) continue;
      const pickedName = String(p.category || "").trim();
      let bucket = bucketByName.get(pickedName);
      if (!bucket) bucket = [...wantedByBucket.keys()].find((b) => hasRoom(b));
      if (!bucket || !hasRoom(bucket)) continue;
      usedByBucket.set(bucket, (usedByBucket.get(bucket) ?? 0) + 1);
      const stat = categoryStats.find((c) => c.bucket === bucket);
      chosen.set(p.index, {
        priority: Math.min(Math.max(Number(p.priority) || 5, 1), 10),
        angle: String(p.angle || "").slice(0, 500),
        category: (stat?.name || pickedName || "הייטק").slice(0, 40),
        bucket,
        updateOf: null,
      });
    }

    // --- 5. Write the ledger ------------------------------------------------
    // Every new URL is recorded, picked or not. That is the whole dedupe
    // guarantee: a story the ranker passed on is never offered again.
    const pickByKey = new Map<string, { priority: number; angle: string; category: string; bucket: string | null; updateOf: string | null }>();
    for (const [idx, pick] of chosen) pickByKey.set(shortlist[idx].key, pick);

    const rows = fresh.map((c) => {
      const pick = pickByKey.get(c.key);
      return {
        url_key: c.key,
        url: c.link,
        source_name: c.sourceName,
        source_title: c.title.slice(0, 500),
        source_summary: (c.summary || "").slice(0, 1000),
        source_image_url: c.image,
        source_published_at: c.publishedAt,
        // The ranker's category, so the per-category quota machinery keeps
        // counting; unpicked rows stay uncategorized.
        bucket: pick?.bucket ?? null,
        status: pick ? "pending" : "seen",
        priority: pick?.priority ?? 0,
        angle: pick?.angle ?? null,
        category_hint: pick?.category ?? null,
        update_of: pick?.updateOf ?? null,
      };
    });

    // A failed write must fail the whole scan. Counting the picks before the
    // upsert once produced a run that reported "4 queued" while the queue
    // stayed empty — the insert had failed on a missing column and the error
    // sat unread in the notes.
    const newRows = rows.filter((r) => !seenOnly.has(r.url_key));
    for (let i = 0; i < newRows.length; i += 100) {
      const { error } = await supabase
        .from("ingest_items")
        .upsert(newRows.slice(i, i + 100), { onConflict: "url_key", ignoreDuplicates: true });
      if (error) {
        notes.push(`upsert: ${error.message}`);
        throw new Error(`שמירת התור נכשלה: ${error.message}`);
      }
    }

    // Resurrections: a picked story whose row already exists as `seen` flips
    // to pending. Guarded by status='seen' so a story that was published,
    // dismissed or failed in the meantime can never be re-queued.
    const resurrected = rows.filter((r) => seenOnly.has(r.url_key) && r.status === "pending");
    for (const r of resurrected) {
      const { error } = await supabase
        .from("ingest_items")
        .update({
          status: "pending",
          priority: r.priority,
          angle: r.angle,
          category_hint: r.category_hint,
          bucket: r.bucket,
          update_of: r.update_of,
          source_image_url: r.source_image_url,
        })
        .eq("url_key", r.url_key)
        .eq("status", "seen");
      if (error) {
        notes.push(`resurrect: ${error.message}`);
        throw new Error(`שמירת התור נכשלה: ${error.message}`);
      }
    }
    if (resurrected.length > 0) {
      notes.push(`הוחזרו לתור ${resurrected.length} ידיעות שנפסלו בסבבים קודמים (השלמת מכסה)`);
    }

    await supabase.from("ingest_runs").insert({
      kind: "scan",
      trigger: auth.trigger,
      sources_ok: sourcesOk,
      sources_failed: sourcesFailed,
      items_seen: unique.length,
      items_new: fresh.length,
      items_queued: pickByKey.size,
      notes,
      duration_ms: Date.now() - startedAt,
    });

    // Stories in the queue mean writing starts NOW, not on the next cron tick:
    // the scan kicks the worker, and the worker chains itself until the queue
    // drains or the quotas fill.
    const secret = Deno.env.get("INGEST_CRON_SECRET");
    if (secret && pickByKey.size > 0) {
      const kick = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ingest-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
        body: JSON.stringify({}),
      }).then((r) => r.body?.cancel()).catch((e) => console.error("worker kick failed", e));
      const runtime = (globalThis as {
        EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
      }).EdgeRuntime;
      if (runtime) runtime.waitUntil(kick);
      notes.push("הכתיבה החלה מיד");
    }

    return json({
      ok: true,
      sources: perSource,
      itemsSeen: unique.length,
      itemsNew: fresh.length,
      queued: pickByKey.size,
      publishedToday: stats.publishedToday,
      dailyTarget: stats.dailyTarget,
      picks: [...chosen.entries()].map(([i, p]) => ({
        source: shortlist[i].sourceName,
        title: shortlist[i].title,
        priority: p.priority,
        angle: p.angle,
      })),
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("ingest-global-tech error", e);
    await supabase.from("ingest_runs").insert({
      kind: "scan",
      trigger: auth.trigger,
      notes: [...notes, e?.message || String(e)],
      duration_ms: Date.now() - startedAt,
    });
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
