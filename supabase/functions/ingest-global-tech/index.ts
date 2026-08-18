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
  callModel,
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
  bucket: string;
  weight: number;
};

type Candidate = FeedItem & {
  key: string;
  sourceName: string;
  bucket: string;
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
    const buckets: string[] | null = Array.isArray(body?.buckets) && body.buckets.length ? body.buckets : null;

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

    // --- 1. Active sources -------------------------------------------------
    // A real scan only reads feeds of categories that still have budget today;
    // a dry run (the "test sources" button) always reads everything.
    let sourceQuery = supabase
      .from("news_sources")
      .select("id, name, feed_url, bucket, weight")
      .eq("is_active", true);
    const bucketFilter = buckets ?? (dryRun ? null : [...wantedByBucket.keys()]);
    if (bucketFilter) sourceQuery = sourceQuery.in("bucket", bucketFilter);
    const { data: sources, error: srcErr } = await sourceQuery;
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
        await supabase
          .from("news_sources")
          .update({ last_fetched_at: new Date().toISOString(), last_status: result.error, last_item_count: 0 })
          .eq("id", source.id);
        continue;
      }
      sourcesOk++;
      // A feed with no dates at all still gets in — its items are simply
      // treated as "now" and the URL ledger keeps them from repeating.
      const fresh = result.items.filter((it) => !it.publishedAt || hoursAgo(it.publishedAt) <= lookbackHours);
      perSource.push({ name: source.name, ok: true, items: fresh.length });
      await supabase
        .from("news_sources")
        .update({ last_fetched_at: new Date().toISOString(), last_status: "ok", last_item_count: fresh.length })
        .eq("id", source.id);

      for (const it of fresh) {
        candidates.push({
          ...it,
          key: urlKey(it.link),
          sourceName: source.name,
          bucket: source.bucket,
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

    const known = new Set<string>();
    const keys = unique.map((c) => c.key);
    for (let i = 0; i < keys.length; i += 150) {
      const { data } = await supabase
        .from("ingest_items")
        .select("url_key")
        .in("url_key", keys.slice(i, i + 150));
      for (const row of data || []) known.add((row as { url_key: string }).url_key);
    }
    const fresh = unique.filter((c) => !known.has(c.key));

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

    // Titles already on the site, so the ranker does not pick a story we ran.
    const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
    const { data: recentArticles } = await supabase
      .from("articles")
      .select("title")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    const alreadyCovered = (recentArticles || []).map((a: { title: string }) => a.title);

    const listing = shortlist
      .map(
        (c, i) =>
          `[${i}] (${c.sourceName} · ${c.bucket}${c.publishedAt ? ` · לפני ${hoursAgo(c.publishedAt).toFixed(1)} שעות` : ""})\n` +
          `כותרת: ${c.title}\n` +
          `תקציר: ${(c.summary || "—").slice(0, 300)}`,
      )
      .join("\n\n");

    // The ranker sees each category's remaining budget. Every candidate line
    // already carries its category (the bucket after the source name).
    const budgetLines = categoryStats
      .filter((c) => wantedByBucket.has(c.bucket))
      .map((c) => `- ${c.bucket}: עד ${wantedByBucket.get(c.bucket)} ידיעות`)
      .join("\n");

    const rankerSystem = `אתה עורך חדשות ראשי של אתר הייטק ישראלי בעברית. קיבלת רשימת כתבות שפורסמו היום באתרי הטכנולוגיה הגדולים בעולם. בחר את הידיעות **הכי חשובות ורלוונטיות לקהל הישראלי** לפרסום.

מכסה לכל קטגוריה (הקטגוריה של ידיעה מופיעה בסוגריים אחרי שם המקור):
${budgetLines}

קריטריונים לבחירה:
- השפעה אמיתית: מוצר חדש משמעותי, מודל AI חדש, מיזוג/רכישה, גיוס ענק, רגולציה, פריצת דרך טכנולוגית, קריסה או משבר בחברה גדולה.
- רלוונטיות לישראל: חברות עם מרכזי פיתוח בישראל, משקיעים ישראלים, סטארטאפים ישראלים, טכנולוגיה שמשפיעה על שוק העבודה בהייטק הישראלי — קבלו עדיפות.
- עניין לקורא: משהו שקורא הייטק ישראלי ירצה לדעת עליו הבוקר.

מה **לא** לבחור:
- ידיעות שכבר מכוסות באתר (רשימת הכותרות האחרונות מצורפת).
- כפילויות: אם שתי ידיעות מספרות את אותו הסיפור, בחר רק אחת — את זו מהמקור האמין יותר.
- תוכן שיווקי, מבצעי קניות, ביקורות גאדג'טים שוליות, רשימות "10 הכי טובים".
- ידיעות שהן בעיקר דעה או פרשנות אישית בלי חדשות אמיתיות.

גוון את הבחירה: אל תיקח את כל הידיעות מאותו מקור או מאותו נושא.

עבור כל בחירה החזר גם:
- priority: 1-10, כמה חשוב לפרסם את זה (10 = ידיעה מובילה).
- angle: משפט אחד בעברית — הזווית שבה כדאי לכתוב את הכתבה לקורא הישראלי.
- category: אחת מ: טכנולוגיה, כלכלה, חדשות, שוק ההון, אקטואליה.

אם בקטגוריה מסוימת אין מספיק ידיעות ראויות — החזר פחות ממכסתה. עדיף לא לפרסם מאשר לפרסם זבל.`;

    const ranked = await callModel({
      messages: [
        { role: "system", content: rankerSystem },
        {
          role: "user",
          content:
            `כותרות שכבר פורסמו באתר ב-72 השעות האחרונות:\n${alreadyCovered.map((t) => `- ${t}`).join("\n") || "— אין —"}\n\n` +
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

    const picks: { index: number; priority: number; angle: string; category: string }[] =
      (toolArgs(ranked).picks as any[]) || [];

    // Enforce the per-category budgets in code: the strongest picks win their
    // category's slots, and whatever the ranker over-picked is dropped.
    const chosen = new Map<number, { priority: number; angle: string; category: string }>();
    const usedByBucket = new Map<string, number>();
    const validPicks = picks
      .filter((p) => Number.isInteger(p.index) && p.index >= 0 && p.index < shortlist.length)
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    for (const p of validPicks) {
      if (chosen.size >= limit) break;
      const bucket = shortlist[p.index].bucket;
      const allowed = wantedByBucket.get(bucket) ?? 0;
      const used = usedByBucket.get(bucket) ?? 0;
      if (used >= allowed) continue;
      usedByBucket.set(bucket, used + 1);
      chosen.set(p.index, {
        priority: Math.min(Math.max(Number(p.priority) || 5, 1), 10),
        angle: String(p.angle || "").slice(0, 500),
        category: String(p.category || "טכנולוגיה").slice(0, 40),
      });
    }

    // --- 5. Write the ledger ------------------------------------------------
    // Every new URL is recorded, picked or not. That is the whole dedupe
    // guarantee: a story the ranker passed on is never offered again.
    const pickByKey = new Map<string, { priority: number; angle: string; category: string }>();
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
        bucket: c.bucket,
        status: pick ? "pending" : "seen",
        priority: pick?.priority ?? 0,
        angle: pick?.angle ?? null,
        category_hint: pick?.category ?? null,
      };
    });

    // A failed write must fail the whole scan. Counting the picks before the
    // upsert once produced a run that reported "4 queued" while the queue
    // stayed empty — the insert had failed on a missing column and the error
    // sat unread in the notes.
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase
        .from("ingest_items")
        .upsert(rows.slice(i, i + 100), { onConflict: "url_key", ignoreDuplicates: true });
      if (error) {
        notes.push(`upsert: ${error.message}`);
        throw new Error(`שמירת התור נכשלה: ${error.message}`);
      }
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
