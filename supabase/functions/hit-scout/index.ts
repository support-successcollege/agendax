// deno-lint-ignore-file no-explicit-any
// "צייד הלהיטים" — picks the one or two articles a day worth a carousel.
//
// The numbers behind it (30 days to 18/10/2026): two articles that got a
// carousel brought 30% of all page views — 575 and 218 — while a regular
// article got 3-5 and a quarter of them got none. The site does not need more
// articles; it needs the right one pushed hard. So every morning this reads
// the last ten hours of published articles, scores each for how likely an
// Israeli reader is to stop, save and share it, and hands the winners to
// social-carousel. hit_studio_advance() (SQL, every few minutes) finishes the
// carousel and puts it in the queue.
//
// The model is shown what actually worked here (top articles by human views)
// so the taste follows the audience rather than a guess about it.
//
// Body:
//   {}                → today's picks (no-op once today's quota is filled)
//   { "dryRun": true } → score and return, write nothing, build nothing
import {
  adminClient,
  authorize,
  callModelWithFallback,
  corsHeaders,
  FALLBACK_IMAGE,
  json,
  toolArgs,
} from "../_shared/ingest.ts";

type Candidate = {
  id: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  image_url: string | null;
  published_at: string;
  source_published_at: string | null;
};

type Pick = { id: string; score: number; angle: string; reason: string };

const israelToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

/**
 * How far back to look. social-publish refuses a story older than 24 hours at
 * its slot (by its source date), and the next hit slot can be up to ~13 hours
 * away, so a pick older than this would be cancelled at the door. On 19/10
 * three 36-hour picks were.
 */
const FRESH_HOURS = 10;

/** The same test the publish gate uses: a stock photo is not an image. */
const hasRealImage = (url: string | null) => {
  const u = (url || "").trim();
  return !!u && u.split("?")[0] !== FALLBACK_IMAGE.split("?")[0];
};

async function scoreWithModel(
  candidates: Candidate[],
  winners: { title: string; views: number }[],
): Promise<Pick[]> {
  const line = (c: Candidate) =>
    `- id:${c.id} | ${c.title} | ${c.category || "—"} | ${(c.excerpt || "").slice(0, 180)}`;
  const proof = winners.length
    ? winners.map((w) => `- ${w.title} (${w.views} צפיות)`).join("\n")
    : "- אין עדיין נתונים";

  const response = await callModelWithFallback({
    messages: [
      {
        role: "system",
        content:
          `אתה עורך הרשתות של אתר חדשות טכנולוגיה, AI וכסף בעברית. הקהל: ישראלים 20-45 באינסטגרם ובפייסבוק, ` +
          `לא אנשי מקצוע בהכרח. המשימה: לתת לכל כתבה ציון 1-10 - כמה סביר שקורא יעצור, ישמור וישתף ` +
          `קרוסלה עליה.\n\n` +
          `מה מקבל ציון גבוה (8-10):\n` +
          `- קריירה ועבודה: תפקידים מבוקשים, שכר, איך להיכנס להייטק, פיטורים שנוגעים לישראלים.\n` +
          `- משהו בחינם או הטבה שאפשר לממש עכשיו: כלי, מנוי, קורס, מענק.\n` +
          `- כסף אישי: מחירים, חיסכון, הונאות שכדאי להכיר.\n` +
          `- שימושי מיד: "איך לעשות X", טיפ שחוסך זמן.\n` +
          `- הפתעה עם מספר ברור, מותג שכולם מכירים, או זווית ישראלית.\n\n` +
          `מה מקבל ציון נמוך (1-4): עסקאות בין חברות, שבבים ותשתיות לאנשי מקצוע, רגולציה יבשה, ` +
          `גיוסים של חברות לא מוכרות, כל מה שקורא רגיל לא ירגיש שהוא נוגע בו.\n\n` +
          `אלה הכתבות שבאמת עבדו אצלנו (צפיות אמיתיות, 30 יום):\n${proof}\n\n` +
          `לכל כתבה שקיבלה 7 ומעלה כתוב גם:\n` +
          `- angle: משפט פתיחה לקרוסלה, עד 12 מילים, שמדבר אל הקורא ("אתם", "שלכם"), בלי סימן קריאה.\n` +
          `- reason: למה היא תעבוד, עד 15 מילים.\n` +
          `אל תמציא עובדות שלא מופיעות בכותרת ובתקציר.`,
      },
      { role: "user", content: `=== כתבות מ-${FRESH_HOURS} השעות האחרונות ===\n${candidates.map(line).join("\n")}` },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "score_articles",
          description: "ציון פוטנציאל ויראלי לכל כתבה",
          parameters: {
            type: "object",
            properties: {
              scores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    score: { type: "integer", minimum: 1, maximum: 10 },
                    angle: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["id", "score", "angle", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["scores"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "score_articles" } },
  });

  const out = toolArgs(response) as { scores?: Pick[] };
  return Array.isArray(out.scores) ? out.scores : [];
}

/** social-carousel does the heavy lifting; this only starts it. */
async function startCarousel(articleId: string): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-carousel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-secret": Deno.env.get("INGEST_CRON_SECRET") ?? "",
    },
    body: JSON.stringify({ action: "create", articleId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.carousel?.id) return { error: String(body?.error || `HTTP ${res.status}`).slice(0, 300) };
  return { id: body.carousel.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = adminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const pickDate = israelToday();

    const { data: settings } = await supabase.from("growth_settings").select("*").eq("id", 1).maybeSingle();
    if (!settings?.hits_enabled && !dryRun) return json({ ok: true, skipped: true, reason: "hits_enabled = false" });
    const perDay = Number(settings?.hits_per_day) || 2;
    const minScore = Number(settings?.hit_min_score) || 7;

    // A pick that was skipped or failed never reached the feed, so it does not
    // spend the day's quota.
    const { data: today } = await supabase
      .from("hit_picks")
      .select("article_id")
      .eq("pick_date", pickDate)
      .not("status", "in", "(skipped,failed)");
    const quota = perDay - (today?.length ?? 0);
    if (quota <= 0 && !dryRun) return json({ ok: true, skipped: true, reason: "המכסה היומית כבר מולאה" });

    // Anything that already had a carousel or a pick is spent.
    const [{ data: everPicked }, { data: everCarousel }] = await Promise.all([
      supabase.from("hit_picks").select("article_id"),
      supabase.from("social_carousels").select("article_id"),
    ]);
    const spent = new Set([...(everPicked ?? []), ...(everCarousel ?? [])].map((r: any) => r.article_id));

    const { data: pool, error: poolErr } = await supabase
      .from("articles")
      .select("id, title, excerpt, category, image_url, published_at, source_published_at")
      .eq("is_draft", false)
      .neq("category_slug", "marketing")
      .gte("published_at", hoursAgo(FRESH_HOURS))
      .order("published_at", { ascending: false })
      .limit(60);
    if (poolErr) throw new Error(`שליפת הכתבות נכשלה: ${poolErr.message}`);
    // Age is judged the way social-publish judges it: by the source's own date
    // when there is one, so a story we published late is still an old story.
    const freshSince = hoursAgo(FRESH_HOURS);
    const candidates = ((pool ?? []) as Candidate[]).filter(
      (a) => hasRealImage(a.image_url) && !spent.has(a.id) && (a.source_published_at || a.published_at) >= freshSince,
    );
    if (candidates.length === 0) return json({ ok: true, skipped: true, reason: "אין כתבות מועמדות" });

    const { data: winners } = await supabase.rpc("top_articles_human", { p_days: 30, p_limit: 8 });

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const scored = (await scoreWithModel(candidates, (winners ?? []) as any[]))
      .filter((s) => byId.has(String(s?.id)) && Number(s?.score) >= 1)
      .sort((a, b) => Number(b.score) - Number(a.score));
    const chosen = scored.filter((s) => Number(s.score) >= minScore).slice(0, Math.max(quota, 0) || perDay);

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        quota,
        minScore,
        chosen: chosen.map((c) => ({ ...c, title: byId.get(c.id)?.title })),
        top10: scored.slice(0, 10).map((c) => ({ score: c.score, title: byId.get(c.id)?.title })),
      });
    }

    const results = [];
    for (const c of chosen) {
      const { data: row, error: insErr } = await supabase
        .from("hit_picks")
        .insert({
          pick_date: pickDate,
          article_id: c.id,
          score: Math.round(Number(c.score)),
          angle: String(c.angle || "").slice(0, 200),
          reason: String(c.reason || "").slice(0, 200),
          status: "picked",
        })
        .select("id")
        .single();
      if (insErr) {
        results.push({ title: byId.get(c.id)?.title, error: insErr.message });
        continue;
      }
      const started = await startCarousel(c.id);
      await supabase
        .from("hit_picks")
        .update(
          started.id
            ? { carousel_id: started.id, status: "carousel", updated_at: new Date().toISOString() }
            : { status: "failed", error: started.error, updated_at: new Date().toISOString() },
        )
        .eq("id", row.id);
      results.push({ title: byId.get(c.id)?.title, score: c.score, carousel: started.id ?? null, error: started.error });
    }

    return json({ ok: true, pickDate, candidates: candidates.length, picked: results });
  } catch (e: any) {
    console.error("hit-scout error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
