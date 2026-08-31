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
  callModelWithFallback,
  corsHeaders,
  FALLBACK_IMAGE,
  fetchArticleText,
  fetchFeed,
  generateImage,
  htmlToText,
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
  update_of: string | null;
  attempts: number;
};

/** Stop claiming new work past this point so the current article can finish. */
const TIME_BUDGET_MS = 95_000;

const WRITER_SYSTEM = (today: string, categoryNames: string, headlineBlock: string) => `היום ${today}. אתה כתב הייטק בכיר באתר חדשות ישראלי בעברית. קיבלת כתבה שפורסמה באתר טכנולוגיה בינלאומי. המשימה: לכתוב **כתבה מקורית בעברית** על אותו האירוע.

עקרונות עבודה — קרא בעיון:
- **אל תתרגם.** קרא, הבן, וכתוב מחדש בניסוח עצמאי שלך, במבנה שלך, בעברית עיתונאית טבעית. אסור לשחזר משפטים או פסקאות מהמקור.
- **אל תמציא.** כל עובדה, מספר, תאריך, שם וסכום חייבים להופיע בחומר המקורי. אם נתון חסר — פשוט אל תזכיר אותו. לעולם אל תשלים פערים מהידע הכללי שלך. **ציטוט במירכאות חייב להופיע מילה במילה בחומר המקור.** אם אין ציטוט מדויק — נסח את התוכן כמשפט תיאורי, בלי מירכאות ובלי בלוק ציטוט.
- **בלי אזכור מקורות.** אסור להזכיר בגוף הכתבה אתרים, כלי תקשורת או כתבים ("על פי הדיווח ב-TechCrunch", "כך מדווח The Verge" — אסור). כתוב כעיתונאי שמדווח את העובדות ישירות. ציטוט ישיר מיוחס אך ורק לאדם או לחברה שאמרו אותו ("אמר מנכ\"ל החברה"), לעולם לא לכלי התקשורת שפרסם.
- **הקשר ישראלי.** אם רלוונטי, הוסף פסקה שמסבירה מה זה אומר לשוק ההייטק הישראלי, לחברות עם מרכזי פיתוח בארץ, או לקורא הישראלי. אם אין קשר אמיתי — אל תמציא אחד.
- **מונחים.** מונחים מקצועיים באנגלית נכתבים בעברית עם המונח הלועזי בסוגריים בהופעה הראשונה, למשל: מודל שפה גדול (LLM). שמות חברות ומוצרים נשארים באנגלית.

מבנה ואורך:
- לידה חזק בפסקה הראשונה: מה קרה, מי, מתי, ולמה זה חשוב.
- **500-850 מילים** בגוף הכתבה.
- **לפחות 3 כותרות משנה** במרקדאון (## כותרת משנה) לפי נושאי משנה.
- שלב רשימות bullet (- פריט) היכן שמתאים, **הדגשות** לנתונים מרכזיים, ו-> לציטוטים.
- טבלת מרקדאון (GFM) רק אם יש נתונים מספריים שמצדיקים אותה.
- **סקשן סיום — רק כשיש מה לומר**: ‏## למה זה חשוב לך‏ — 2-4 משפטים על המשמעות המעשית של ההתפתחות: מה היא אומרת לתעשייה, למשתמשים, או לקורא הישראלי — אם ורק אם החומר המקורי עצמו מבסס זווית ישראלית. **הסקשן אינו חובה. אם אין תובנה שנשענת על החומר עצמו — השמט אותו לגמרי.** סקשן שממציא רלוונטיות גרוע מסקשן חסר, והמאמת פוסל עליו.
- שפה רהוטה, אובייקטיבית, בלי דעות אישיות ובלי סופרלטיבים שיווקיים.
- החזר מרקדאון נקי בשדה body — בלי code fences ובלי כותרת H1 (הכותרת נשלחת בנפרד).

בנוסף:
- title: כותרת חדה בעברית, עד 12 מילים, בלי קליקבייט.
- subtitle: לידה של 1-2 משפטים.
- category: אחת מ: ${categoryNames}.
- image_prompt: פרומפט **באנגלית** לתמונה חדשותית ריאליסטית שמלווה את הכתבה. בלי טקסט בתמונה, בלי לוגואים, בלי פרצופים של אנשים אמיתיים מזוהים.
- key_facts: 3-5 עובדות מפתח קצרות.
- confidence: 1-10, כמה בטוח אתה שהחומר המקורי הספיק לכתבה מדויקת ומלאה.

החזר רק דרך הכלי write_hebrew_article.${headlineBlock}`;

// ---------------------------------------------------------------------------
// Update flow: the ranker flagged this story as a development of an article
// that is already on the site — append an update block instead of opening a
// fresh piece.
// ---------------------------------------------------------------------------
const UPDATER_SYSTEM = `אתה כתב באתר חדשות ישראלי בעברית. כתבה שלך כבר פורסמה, והגיע דיווח חדש עם התפתחות באותו סיפור. כתוב **פסקת עדכון** שתתווסף לסוף הכתבה.

כללים:
- 60-200 מילים, מרקדאון (מותר **הדגשות** ורשימות קצרות), בלי כותרות.
- רק מה שחדש — אל תחזור על מה שכבר כתוב בכתבה.
- כל עובדה חייבת להופיע בדיווח החדש. אל תמציא.
- בלי אזכור אתרים או כלי תקשורת; ציטוט מיוחס רק לאדם/חברה שאמרו אותו.
- אם ההתפתחות משנה את התמונה מהותית, הצע גם כותרת מעודכנת לכתבה (updated_title); אחרת השאר ריק.
- אם אין באמת מידע חדש מהותי — החזר significant=false.

החזר רק דרך הכלי write_update.`;

/** The date line shown on an update block, Israel time. */
function updateStamp(): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

/**
 * The closing "למה זה חשוב לך" section gets its branded box. Everything from
 * that heading to the end of the article is wrapped; when the model skipped
 * the section (it happens), the article simply renders unboxed.
 */
function wrapWhyItMatters(html: string): string {
  const m = html.match(/<h2[^>]*>\s*למה זה חשוב/);
  if (!m || m.index === undefined) return html;
  return html.slice(0, m.index) +
    `<div class="why-it-matters">` + html.slice(m.index) + `</div>`;
}

/**
 * Sub-editor pass: the draft against the raw material. Score and issues are
 * saved on the article for the editors; a low score keeps the draft
 * unscheduled so a human decides. A failed review never blocks the article.
 */
async function reviewDraft(
  draft: { title: string; body: string },
  sourceMaterial: string,
): Promise<{ score: number | null; note: string | null }> {
  try {
    const response = await callModelWithFallback({
      messages: [
        {
          role: "system",
          content: `אתה עורך משנה קפדן באתר חדשות. קיבלת טיוטת כתבה בעברית ואת חומר הגלם שממנו נכתבה. בדוק:
1. דיוק: כל מספר, שם, תאריך וסכום בטיוטה מופיע בחומר הגלם. עובדה שאין לה מקור = בעיה חמורה.
2. שלמות: הלב של הסיפור לא הוחמץ.
3. כותרת: משקפת את התוכן, בלי הבטחת יתר.
4. עברית: ניסוח טבעי, בלי שרידי תרגום.
החזר ציון 1-10 (10 = מוכן לפרסום כמו שהוא, 6 ומטה = דורש עין אנושית) ורשימת בעיות קצרה. החזר רק דרך הכלי review_article.`,
        },
        { role: "user", content: `=== הטיוטה ===\nכותרת: ${draft.title}\n\n${draft.body.slice(0, 9000)}\n\n=== חומר הגלם ===\n${sourceMaterial.slice(0, 9000)}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "review_article",
            description: "פסק דין של עורך המשנה על הטיוטה",
            parameters: {
              type: "object",
              properties: {
                score: { type: "integer", description: "1-10" },
                issues: { type: "array", items: { type: "string" }, description: "בעיות שנמצאו, קצר וענייני" },
              },
              required: ["score", "issues"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "review_article" } },
    });
    const verdict = toolArgs(response) as { score: number; issues: string[] };
    const score = Math.min(Math.max(Number(verdict.score) || 0, 1), 10);
    const issues = (verdict.issues || []).filter(Boolean).slice(0, 6);
    return { score, note: issues.length ? issues.join(" · ").slice(0, 800) : null };
  } catch (e) {
    console.error("reviewDraft failed", e);
    return { score: null, note: null };
  }
}

/** The recent headline scoreboard, injected into the writer's prompt. */
async function headlinePerformanceBlock(supabase: any): Promise<string> {
  try {
    const { data } = await supabase.rpc("headline_performance");
    const rows = (data || []) as { title: string; views: number; side: string }[];
    const top = rows.filter((r) => r.side === "top" && r.views > 0);
    const bottom = rows.filter((r) => r.side === "bottom");
    if (top.length < 2) return "";
    return `\n\nנתוני קהל מהשבוע האחרון — למד מסגנון הכותרות שעבדו (בלי להעתיק אותן):
הכי נקראו:
${top.map((r) => `- ${r.title}`).join("\n")}
הכי פחות נקראו:
${bottom.map((r) => `- ${r.title}`).join("\n")}`;
  } catch {
    return "";
  }
}

async function processUpdate(supabase: any, item: Item): Promise<{ ok: true; articleId: string; title: string } | { ok: false; error: string }> {
  const { data: target } = await supabase
    .from("articles")
    .select("id, slug, title, content, is_draft, source_links")
    .eq("id", item.update_of!)
    .maybeSingle();
  if (!target) return { ok: false, error: "כתבת היעד לעדכון כבר לא קיימת" };

  const original = await fetchArticleText(item.url);
  const originalText = original?.text || "";
  const resolvedUrl = original?.url || item.url;
  if (originalText.length < 500 && (item.source_summary || "").length < 300) {
    return { ok: false, error: "לא הצלחנו לקרוא את הדיווח החדש (paywall או חסימה)" };
  }

  const existingText = htmlToText(target.content || "").slice(0, 7000);
  const response = await callModelWithFallback({
    messages: [
      { role: "system", content: UPDATER_SYSTEM },
      {
        role: "user",
        content: `=== הכתבה שכבר באתר ===\nכותרת: ${target.title}\n\n${existingText}\n\n=== הדיווח החדש (${item.source_name}) ===\nכותרת: ${item.source_title}\n\n${(originalText || item.source_summary || "").slice(0, 9000)}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "write_update",
          description: "פסקת עדכון לכתבה קיימת",
          parameters: {
            type: "object",
            properties: {
              update_md: { type: "string", description: "פסקת העדכון במרקדאון, בלי כותרות" },
              updated_title: { type: "string", description: "כותרת מעודכנת לכתבה, או מחרוזת ריקה" },
              significant: { type: "boolean" },
            },
            required: ["update_md", "significant"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "write_update" } },
  });
  const upd = toolArgs(response) as { update_md: string; updated_title?: string; significant: boolean };
  if (!upd.significant || !upd.update_md || upd.update_md.trim().length < 40) {
    return { ok: false, error: "אין בדיווח החדש מידע מהותי מעבר לכתבה הקיימת" };
  }

  const block =
    `<div class="article-update">` +
    `<h2 class="text-2xl md:text-3xl font-bold text-foreground mt-8 mb-4 border-b-2 border-primary/20 pb-2">עדכון · ${updateStamp()}</h2>` +
    mdToArticleHtml(upd.update_md) +
    `</div>`;

  // The update lands after the body but before the closing "why it matters"
  // box, so the box stays the article's last word.
  const content: string = target.content || "";
  const boxAt = content.indexOf('<div class="why-it-matters">');
  const newContent = boxAt >= 0
    ? content.slice(0, boxAt) + block + content.slice(boxAt)
    : content + block;

  const sourceLinks = Array.isArray(target.source_links) ? [...target.source_links] : [];
  sourceLinks.push({ title: `עדכון — ${item.source_name}: ${item.source_title}`, url: resolvedUrl });

  const newTitle = (upd.updated_title || "").trim();
  const { error: updErr } = await supabase
    .from("articles")
    .update({
      content: newContent,
      ...(newTitle && newTitle.length >= 10 ? { title: newTitle.slice(0, 300) } : {}),
      source_links: sourceLinks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);
  if (updErr) return { ok: false, error: `עדכון הכתבה נכשל: ${updErr.message}` };

  // A live article changed — tell Google right away (the DB trigger only
  // fires on the draft→published flip).
  if (!target.is_draft) {
    const secret = Deno.env.get("INGEST_CRON_SECRET");
    if (secret) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/index-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
        body: JSON.stringify({ articleId: target.id }),
      }).catch((e) => console.error("index-article ping failed", e));
    }
  }
  return { ok: true, articleId: target.id, title: `עדכון: ${newTitle || target.title}` };
}

async function processItem(supabase: any, item: Item, slotStepMinutes: number): Promise<{ ok: true; articleId: string; title: string } | { ok: false; error: string }> {
  // A development of an article already on the site takes the update path.
  if (item.update_of) return await processUpdate(supabase, item);

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

  const headlineBlock = await headlinePerformanceBlock(supabase);
  const response = await callModelWithFallback({
    messages: [
      { role: "system", content: WRITER_SYSTEM(today, categoryNames, headlineBlock) },
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

  // --- 4. Attribution — for the editors, never for the readers -------------
  // The links land in articles.source_links (shown in the admin edit dialog);
  // the public body stays clean of any source mention.
  const sourceLinks = [
    { title: `${item.source_name}: ${item.source_title}`, url: resolvedUrl },
    ...relatedItems.map((r) => ({ title: r.title, url: r.link })),
  ];
  const body = article.body;

  // --- 4b. Sub-editor review ------------------------------------------------
  // A second model pass checks the draft against the raw material. The verdict
  // is saved for the editors; 6 and under keeps the draft unscheduled so a
  // human approves it before it can go live.
  const review = await reviewDraft(
    { title: article.title, body },
    `${originalText || item.source_summary || ""}${relatedBlock}`,
  );
  const needsHuman = review.score !== null && review.score <= 6;

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
  // Sources carry no category: the writer, who read the full article, files
  // it; the ranker's pick-time hint is the fallback.
  const { category, category_slug } = await resolveCategory(
    supabase,
    article.category || item.category_hint,
  );
  const excerpt = (article.subtitle || (article.key_facts || []).slice(0, 2).join(" ")).slice(0, 400);

  // Auto-scheduling: the draft takes the next free slot in the publishing
  // window (06:00–24:00 Israel time) and the publish cron flips it live when
  // the slot arrives. Until then the editor can still edit or delete it. If
  // the slot RPC fails the article stays an unscheduled draft — manual
  // publishing is the fallback, never a lost article.
  const { data: slot, error: slotErr } = needsHuman
    ? { data: null, error: null }
    : await supabase.rpc("next_publish_slot", { _step_minutes: slotStepMinutes });
  if (slotErr) console.error("next_publish_slot failed", slotErr);

  const { data: inserted, error: insertErr } = await supabase
    .from("articles")
    .insert({
      title: article.title.slice(0, 300),
      excerpt,
      content: wrapWhyItMatters(mdToArticleHtml(body)),
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
      source_links: sourceLinks,
      review_score: review.score,
      review_note: needsHuman
        ? `דורש אישור אנושי (ציון ${review.score}/10). ${review.note ?? ""}`.trim()
        : review.note,
    })
    .select("id")
    .single();

  if (insertErr) return { ok: false, error: `שמירת הכתבה נכשלה: ${insertErr.message}` };
  return {
    ok: true,
    articleId: inserted.id,
    title: needsHuman ? `${article.title} (ממתין לאישור — ציון ${review.score}/10)` : article.title,
  };
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

  // Even with every category at quota the loop still runs: update items
  // (bucket is null) ride on existing articles and spend no daily budget.
  let processedAny = false;

  for (let n = 0; n < max; n++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      notes.push("נעצר בגלל מגבלת זמן ריצה");
      break;
    }
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
