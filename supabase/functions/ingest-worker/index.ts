// deno-lint-ignore-file no-explicit-any
//
// Phase 2 of the global hi-tech pipeline: take one queued story, read the
// original in full, write an original Hebrew article about it, generate an
// image, and save it as a draft for the editor to approve.
//
// One story per invocation (two at most) so the function never runs out of
// wall-clock time mid-article. Cron calls it every few minutes; when the queue
// is empty it returns immediately.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  authorize,
  callModel,
  corsHeaders,
  FALLBACK_IMAGE,
  fetchArticleText,
  fetchFeed,
  generateImage,
  mirrorImageToBucket,
  json,
  loadCategoryStats,
  loadStats,
  mdToArticleHtml,
  resolveCategory,
  toolArgs,
} from "../_shared/ingest.ts";

type Item = {
  id: string;
  url: string;
  source_name: string;
  source_title: string;
  source_summary: string | null;
  source_image_url: string | null;
  source_published_at: string | null;
  bucket: string | null;
  angle: string | null;
  category_hint: string | null;
  attempts: number;
};

/** Stop claiming new work past this point so the current article can finish. */
const TIME_BUDGET_MS = 95_000;

const WRITER_SYSTEM = (today: string, categoryNames: string) => `היום ${today}. אתה כתב הייטק בכיר באתר חדשות ישראלי בעברית. קיבלת כתבה שפורסמה באתר טכנולוגיה בינלאומי. המשימה: לכתוב **כתבה מקורית בעברית** על אותו האירוע.

עקרונות עבודה — קרא בעיון:
- **אל תתרגם.** קרא, הבן, וכתוב מחדש בניסוח עצמאי שלך, במבנה שלך, בעברית עיתונאית טבעית. אסור לשחזר משפטים או פסקאות מהמקור.
- **אל תמציא.** כל עובדה, מספר, תאריך, שם וסכום חייבים להופיע בחומר המקורי. אם נתון חסר — פשוט אל תזכיר אותו. לעולם אל תשלים פערים מהידע הכללי שלך.
- **ייחוס.** ציטוטים ישירים ונתונים בלעדיים יש לייחס למקור בגוף הטקסט ("על פי הדיווח ב-TechCrunch", "כך מדווח The Verge"). ציטוט ישיר — עד משפט אחד, במרכאות, עם ייחוס.
- **הקשר ישראלי.** אם רלוונטי, הוסף פסקה שמסבירה מה זה אומר לשוק ההייטק הישראלי, לחברות עם מרכזי פיתוח בארץ, או לקורא הישראלי. אם אין קשר אמיתי — אל תמציא אחד.
- **מונחים.** מונחים מקצועיים באנגלית נכתבים בעברית עם המונח הלועזי בסוגריים בהופעה הראשונה, למשל: מודל שפה גדול (LLM). שמות חברות ומוצרים נשארים באנגלית.

מבנה ואורך:
- לידה חזק בפסקה הראשונה: מה קרה, מי, מתי, ולמה זה חשוב.
- **500-850 מילים** בגוף הכתבה.
- **לפחות 3 כותרות משנה** במרקדאון (## כותרת משנה) לפי נושאי משנה.
- שלב רשימות bullet (- פריט) היכן שמתאים, **הדגשות** לנתונים מרכזיים, ו-> לציטוטים.
- טבלת מרקדאון (GFM) רק אם יש נתונים מספריים שמצדיקים אותה.
- שפה רהוטה, אובייקטיבית, בלי דעות אישיות ובלי סופרלטיבים שיווקיים.
- החזר מרקדאון נקי בשדה body — בלי code fences ובלי כותרת H1 (הכותרת נשלחת בנפרד).

בנוסף:
- title: כותרת חדה בעברית, עד 12 מילים, בלי קליקבייט.
- subtitle: לידה של 1-2 משפטים.
- category: אחת מ: ${categoryNames}.
- image_prompt: פרומפט **באנגלית** לתמונה חדשותית ריאליסטית שמלווה את הכתבה. בלי טקסט בתמונה, בלי לוגואים, בלי פרצופים של אנשים אמיתיים מזוהים.
- key_facts: 3-5 עובדות מפתח קצרות.
- confidence: 1-10, כמה בטוח אתה שהחומר המקורי הספיק לכתבה מדויקת ומלאה.

החזר רק דרך הכלי write_hebrew_article.`;

async function processItem(supabase: any, item: Item, slotStepMinutes: number): Promise<{ ok: true; articleId: string; title: string } | { ok: false; error: string }> {
  // --- 1. The original, in full ------------------------------------------
  const original = await fetchArticleText(item.url);
  const originalText = original?.text || "";
  const resolvedUrl = original?.url || item.url;

  // The feed summary alone is usually a teaser paragraph — not enough to write
  // 600 words from without inventing the rest.
  if (originalText.length < 800 && (item.source_summary || "").length < 400) {
    return { ok: false, error: "לא הצלחנו לקרוא את הכתבה המקורית (paywall או חסימה)" };
  }

  // --- 2. Corroboration: what else was written about the same story --------
  const related = await fetchFeed(
    `https://news.google.com/rss/search?q=${encodeURIComponent(item.source_title.slice(0, 120))}&hl=en-US&gl=US&ceid=US:en`,
    8000,
  );
  const relatedItems = related.ok ? related.items.slice(0, 4) : [];
  const relatedBlock = relatedItems.length
    ? `\n\n=== דיווחים נוספים על אותו האירוע (לאימות והרחבה בלבד) ===\n` +
      relatedItems.map((r, i) => `[${i + 1}] ${r.title}\n${(r.summary || "").slice(0, 300)}\n${r.link}`).join("\n\n")
    : "";

  // --- 3. Write ------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  // The category list is live data, not prompt text — a hardcoded list here
  // went stale twice (rebrand, then panel renames).
  const { data: liveCategories } = await supabase
    .from("categories")
    .select("name")
    .eq("is_active", true)
    .neq("slug", "home");
  const categoryNames =
    (liveCategories || []).map((c: { name: string }) => c.name).join(", ") || "הייטק";
  const userContent =
    `מקור: ${item.source_name}\n` +
    `כתובת: ${resolvedUrl}\n` +
    `כותרת מקורית: ${item.source_title}\n` +
    (item.source_published_at ? `פורסם: ${item.source_published_at}\n` : "") +
    (item.angle ? `\nהזווית שביקש העורך: ${item.angle}\n` : "") +
    `\n=== גוף הכתבה המקורית ===\n${originalText || item.source_summary}` +
    relatedBlock;

  const response = await callModel({
    messages: [
      { role: "system", content: WRITER_SYSTEM(today, categoryNames) },
      { role: "user", content: userContent },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "write_hebrew_article",
          description: "מחזיר כתבה מקורית בעברית המבוססת על הדיווח הלועזי",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              body: { type: "string", description: "מרקדאון GFM, 500-850 מילים" },
              category: { type: "string" },
              image_prompt: { type: "string" },
              key_facts: { type: "array", items: { type: "string" } },
              confidence: { type: "integer" },
            },
            required: ["title", "subtitle", "body", "category", "image_prompt", "key_facts", "confidence"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "write_hebrew_article" } },
  });

  const article = toolArgs(response) as {
    title: string;
    subtitle: string;
    body: string;
    category: string;
    image_prompt: string;
    key_facts: string[];
    confidence: number;
  };

  if (!article.title || !article.body || article.body.length < 400) {
    return { ok: false, error: "המודל החזיר כתבה קצרה או ריקה" };
  }
  if (Number(article.confidence) <= 3) {
    return { ok: false, error: `המודל דיווח ביטחון נמוך (${article.confidence}/10) — החומר המקורי לא הספיק` };
  }

  // --- 4. Attribution block ------------------------------------------------
  // Never optional. The Hebrew article is ours, the reporting is theirs, and the
  // link back is what keeps that honest (and what Google News expects to see).
  const sourceLines = [
    `1. [${item.source_name}: ${item.source_title}](${resolvedUrl})`,
    ...relatedItems.map((r, i) => `${i + 2}. [${r.title}](${r.link})`),
  ].join("\n");
  const body = `${article.body}\n\n## מקורות\n\n${sourceLines}`;

  // --- 5. Image ------------------------------------------------------------
  // Priority: the source's own editorial image (mirrored into our bucket) →
  // AI generation → stock fallback. The source image is almost always the
  // better one — it is the actual photo the story is about — and generation
  // is both quota-limited and generic by comparison.
  const imageUrl =
    (item.source_image_url
      ? await mirrorImageToBucket(supabase, item.source_image_url)
      : null) ||
    (await generateImage(supabase, article.image_prompt)) ||
    FALLBACK_IMAGE;

  // --- 6. Save as draft ----------------------------------------------------
  // The source's category wins: the editor filed the feed under a category on
  // purpose, and that intent beats the model's guess. Model/ranker suggestions
  // only decide when the item somehow has no source category.
  let category: string;
  let category_slug: string;
  const { data: sourceCategory } = item.bucket
    ? await supabase
        .from("categories")
        .select("name, slug")
        .eq("slug", item.bucket)
        .eq("is_active", true)
        .maybeSingle()
    : { data: null };
  if (sourceCategory) {
    category = sourceCategory.name;
    category_slug = sourceCategory.slug;
  } else {
    ({ category, category_slug } = await resolveCategory(
      supabase,
      article.category || item.category_hint,
    ));
  }
  const excerpt = (article.subtitle || (article.key_facts || []).slice(0, 2).join(" ")).slice(0, 400);

  // Auto-scheduling: the draft takes the next free slot in the publishing
  // window (06:00–24:00 Israel time) and the publish cron flips it live when
  // the slot arrives. Until then the editor can still edit or delete it. If
  // the slot RPC fails the article stays an unscheduled draft — manual
  // publishing is the fallback, never a lost article.
  const { data: slot, error: slotErr } = await supabase.rpc("next_publish_slot", {
    _step_minutes: slotStepMinutes,
  });
  if (slotErr) console.error("next_publish_slot failed", slotErr);

  const { data: inserted, error: insertErr } = await supabase
    .from("articles")
    .insert({
      title: article.title.slice(0, 300),
      excerpt,
      content: mdToArticleHtml(body),
      category,
      category_slug,
      image_url: imageUrl,
      author: "מערכת Agendax",
      is_draft: true,
      scheduled_at: slot ?? null,
      is_breaking: false,
      is_featured: false,
      source_url: resolvedUrl,
      source_name: item.source_name,
      source_published_at: item.source_published_at,
    })
    .select("id")
    .single();

  if (insertErr) return { ok: false, error: `שמירת הכתבה נכשלה: ${insertErr.message}` };
  return { ok: true, articleId: inserted.id, title: article.title };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const startedAt = Date.now();
  const supabase = adminClient();

  const body = await req.json().catch(() => ({}));
  const max = Math.min(Math.max(Number(body?.max) || 1, 1), 3);

  const created: { id: string; title: string }[] = [];
  const notes: string[] = [];

  // The daily cap lives here rather than in the scanner because only the worker
  // knows what actually got written. The scanner queues spares on purpose; this
  // is what stops those spares from turning into extra articles on a day when
  // nothing failed. The target is PER CATEGORY: the claim only takes stories
  // from categories that still have budget today.
  const stats = await loadStats(supabase);
  const categoryStats = await loadCategoryStats(supabase);
  const budgetByBucket = new Map<string, number>();
  for (const cat of categoryStats) {
    const left = stats.dailyTarget - cat.publishedToday;
    if (left > 0) budgetByBucket.set(cat.bucket, left);
  }
  // The publishing window is 18 hours (06:00–24:00 Israel); spreading the
  // whole day's output across it evenly gives the slot spacing. 40 articles a
  // day → a new one goes live every 27 minutes.
  const slotStepMinutes = Math.max(
    5,
    Math.floor((18 * 60) / Math.max(1, stats.dailyTarget * stats.categoryCount)),
  );

  if (budgetByBucket.size === 0) {
    return json({
      ok: true,
      created: [],
      skipped: "היעד היומי הושלם בכל הקטגוריות",
      publishedToday: stats.publishedToday,
      dailyTarget: stats.dailyTarget,
      remaining: stats.queued,
      notes: [],
      durationMs: Date.now() - startedAt,
    });
  }

  let processedAny = false;

  for (let n = 0; n < max; n++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      notes.push("נעצר בגלל מגבלת זמן ריצה");
      break;
    }
    if (budgetByBucket.size === 0) break;

    const { data: item, error: claimErr } = await supabase.rpc("claim_ingest_item", {
      _buckets: [...budgetByBucket.keys()],
    });
    if (claimErr) {
      notes.push(`claim: ${claimErr.message}`);
      break;
    }
    if (!item?.id) break; // queue empty
    processedAny = true;

    const typed = item as Item;
    try {
      const result = await processItem(supabase, typed, slotStepMinutes);
      if (result.ok) {
        await supabase
          .from("ingest_items")
          // published_at, not updated_at: the updated_at trigger rewrites itself on
          // every later write, and the daily counter must not drift.
          .update({
            status: "published",
            article_id: result.articleId,
            error: null,
            published_at: new Date().toISOString(),
          })
          .eq("id", typed.id);
        created.push({ id: result.articleId, title: result.title });
        // Spend the category's budget locally so a multi-story invocation
        // cannot overshoot one category before the next stats load sees it.
        if (typed.bucket && budgetByBucket.has(typed.bucket)) {
          const left = budgetByBucket.get(typed.bucket)! - 1;
          if (left <= 0) budgetByBucket.delete(typed.bucket);
          else budgetByBucket.set(typed.bucket, left);
        }
      } else {
        // attempts was already incremented by claim_ingest_item.
        // claim_ingest_item already incremented attempts, so this is the count so far.
        const exhausted = typed.attempts >= 3;
        await supabase
          .from("ingest_items")
          .update({ status: exhausted ? "failed" : "pending", error: result.error })
          .eq("id", typed.id);
        notes.push(`${typed.source_title.slice(0, 60)}: ${result.error}`);
      }
    } catch (e: any) {
      const message = e?.message || String(e);
      // claim_ingest_item already incremented attempts, so this is the count so far.
        const exhausted = typed.attempts >= 3;
      await supabase
        .from("ingest_items")
        .update({ status: exhausted ? "failed" : "pending", error: message })
        .eq("id", typed.id);
      notes.push(`${typed.source_title.slice(0, 60)}: ${message}`);
    }
  }

  if (created.length > 0 || notes.length > 0) {
    await supabase.from("ingest_runs").insert({
      kind: "worker",
      trigger: auth.trigger,
      articles_created: created.length,
      notes,
      duration_ms: Date.now() - startedAt,
    });
  }

  const { count } = await supabase
    .from("ingest_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // --- Self-chain -----------------------------------------------------------
  // The cron is only the ignition. As long as the queue holds stories and some
  // category still has budget, each invocation kicks off the next one before
  // returning, so the queue drains back-to-back instead of one story per cron
  // tick. The chain is bounded: every claim increments attempts (3 → failed),
  // the queue is finite, and the budget check runs fresh in each invocation —
  // so it always terminates. `processedAny` guards the case where the queue is
  // non-empty but nothing in it is claimable, which would otherwise loop.
  const secret = Deno.env.get("INGEST_CRON_SECRET");
  if (secret && processedAny && (count ?? 0) > 0 && budgetByBucket.size > 0) {
    const chain = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ingest-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
      body: JSON.stringify({ max }),
    }).then((r) => r.body?.cancel()).catch((e) => console.error("chain failed", e));
    // waitUntil keeps this instance alive until the next one has been started;
    // the next invocation then runs on its own fresh wall clock.
    const runtime = (globalThis as {
      EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (runtime) runtime.waitUntil(chain);
    notes.push("ממשיך מיד לידיעה הבאה בתור");
  }

  return json({
    ok: true,
    created,
    remaining: count ?? 0,
    publishedToday: stats.publishedToday + created.length,
    dailyTarget: stats.dailyTarget,
    notes,
    durationMs: Date.now() - startedAt,
  });
});
