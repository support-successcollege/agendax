// deno-lint-ignore-file no-explicit-any
// "בחירת העורכים" — one deliberate set of articles per day.
//
// The section it replaces ranked by 48-hour page views. On a site with tens of
// views a day that is noise dressed as a signal, and the same three articles
// held the top for a week. This picks a fresh set every morning, refuses to
// repeat anything from the last ten days, and writes a line of reasoning for
// each one — so the rail reads like someone chose it, because the choosing is
// real even though nobody is doing it by hand.
//
// Body:
//   {}                          → today's picks (no-op if they already exist)
//   { "force": true }           → rebuild today's set
//   { "date": "YYYY-MM-DD" }    → build for a specific day
import {
  adminClient,
  authorize,
  callModelWithFallback,
  corsHeaders,
  FALLBACK_IMAGE,
  json,
  toolArgs,
} from "../_shared/ingest.ts";

const PICK_COUNT = 6;
const FRESH_QUOTA = 4;
/** An article cannot come back for this long. This is the whole point. */
const NO_REPEAT_DAYS = 10;
const MAX_PER_CATEGORY = 2;

type Candidate = {
  id: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  category_slug: string | null;
  image_url: string | null;
  published_at: string;
};

const israelToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString();

/** The same test the publish gate uses: a stock photo is not an image. */
const hasRealImage = (url: string | null) => {
  const u = (url || "").trim();
  return !!u && u.split("?")[0] !== FALLBACK_IMAGE.split("?")[0];
};

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long" })
    .format(new Date(iso));

/**
 * Asks the model to do the editing: choose from the two pools and say why each
 * one earns its slot. The note is the part a reader notices, so it is written
 * from the title and excerpt only — inventing a detail here would be the same
 * failure the article pipeline already gets caught on.
 */
async function chooseWithModel(
  fresh: Candidate[],
  veteran: Candidate[],
): Promise<{ id: string; note: string }[]> {
  const line = (c: Candidate) =>
    `- id:${c.id} | ${c.title} | ${c.category || "—"} | ${(c.excerpt || "").slice(0, 160)}`;

  const response = await callModelWithFallback({
    messages: [
      {
        role: "system",
        content:
          `אתה עורך ראשי של אתר חדשות טכנולוגיה וכלכלה בעברית. אתה בוחר את "בחירת העורכים" של היום — ` +
          `${PICK_COUNT} כתבות שמופיעות בעמוד הבית.\n\n` +
          `כללי הבחירה:\n` +
          `- בדיוק ${PICK_COUNT} כתבות: ${FRESH_QUOTA} מהרשימה הטרייה ו-${PICK_COUNT - FRESH_QUOTA} מהוותיקות.\n` +
          `- לכל היותר ${MAX_PER_CATEGORY} כתבות מאותה קטגוריה.\n` +
          `- בחר לפי מה שמעניין קורא ישראלי בהייטק: משמעות, חדשנות, השלכה על השוק. לא לפי כותרת רועשת.\n` +
          `- סדר אותן: הראשונה היא זו שהיית שם בראש העמוד.\n\n` +
          `לכל כתבה כתוב **נימוק אחד** באורך 6-12 מילים.\n\n` +
          `החוק הראשון של הנימוק: **הוא לא חוזר על הכותרת.** הכותרת כבר אומרת מה קרה. ` +
          `הנימוק אומר דבר אחד אחר — למה זה משנה, למי זה משנה, מה מפתיע כאן, או מה זה מסמן ` +
          `על מה שיקרה הלאה. אם אפשר להסיק את הנימוק מהכותרת בלבד, הוא לא טוב מספיק.\n` +
          `דוגמה רעה: "עצרנו על ההכרעה המשפטית שמנעה את פירוק חטיבת הפרסום" (חזרה על הכותרת).\n` +
          `דוגמה טובה: "הרגולטור בחר לרסן ולא לשבור - תקדים לכל תיק אנטיטראסט הבא".\n\n` +
          `הנימוק נשען על הכותרת והתקציר בלבד. אסור להמציא מספרים, שמות או עובדות שלא מופיעים שם; ` +
          `כשאין מספיק חומר לתובנה, כתוב נימוק כללי ונכון במקום להמציא פרט.\n` +
          `סגנון: משפט אחד, בלי סופרלטיבים, בלי "חובה לקרוא", בלי סימן קריאה. ` +
          `**גוון את הפתיחים** - אסור ששני נימוקים יתחילו באותה מילה.`,
      },
      {
        role: "user",
        content:
          `=== כתבות טריות (48 שעות אחרונות) ===\n${fresh.map(line).join("\n")}\n\n` +
          `=== כתבות ותיקות (3-21 ימים) ===\n${veteran.map(line).join("\n")}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "pick_articles",
          description: "בחירת העורכים של היום",
          parameters: {
            type: "object",
            properties: {
              picks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "מזהה הכתבה כפי שהופיע ברשימה" },
                    note: { type: "string", description: "נימוק של 6-14 מילים" },
                  },
                  required: ["id", "note"],
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
    tool_choice: { type: "function", function: { name: "pick_articles" } },
  });

  const out = toolArgs(response) as { picks?: { id: string; note: string }[] };
  return Array.isArray(out.picks) ? out.picks : [];
}

/**
 * Keeps only picks that name a real candidate, drops duplicates, and enforces
 * the category cap the model was asked for but cannot be trusted to hold.
 */
function validate(
  picks: { id: string; note: string }[],
  pool: Map<string, Candidate>,
): { id: string; note: string }[] {
  const chosen: { id: string; note: string }[] = [];
  const seen = new Set<string>();
  const perCategory = new Map<string, number>();
  for (const p of picks) {
    const id = String(p?.id || "").trim();
    const candidate = pool.get(id);
    if (!candidate || seen.has(id)) continue;
    const key = candidate.category_slug || candidate.category || "—";
    if ((perCategory.get(key) ?? 0) >= MAX_PER_CATEGORY) continue;
    const note = String(p?.note || "").trim().replace(/\s+/g, " ").slice(0, 160);
    chosen.push({ id, note });
    seen.add(id);
    perCategory.set(key, (perCategory.get(key) ?? 0) + 1);
    if (chosen.length >= PICK_COUNT) break;
  }
  return chosen;
}

/**
 * Fills the set back to PICK_COUNT after validation dropped something — a
 * third article from one category, say. Without this the section quietly comes
 * out short on exactly the days the model over-weights one subject.
 */
function topUp(
  chosen: { id: string; note: string }[],
  pools: Candidate[][],
): { id: string; note: string }[] {
  const seen = new Set(chosen.map((c) => c.id));
  // Categories already spent by the model's own picks are not re-counted here:
  // validate() enforced the cap on those, and this pass only needs to avoid
  // piling more onto whatever it adds itself.
  const perCategory = new Map<string, number>();
  const out = [...chosen];
  for (const pool of pools) {
    for (const candidate of pool) {
      if (out.length >= PICK_COUNT) return out;
      if (seen.has(candidate.id)) continue;
      const key = candidate.category_slug || candidate.category || "—";
      const used = perCategory.get(key) ?? 0;
      if (used >= MAX_PER_CATEGORY) continue;
      perCategory.set(key, used + 1);
      seen.add(candidate.id);
      // No note: a filler line is worse than none, and the reader sees a
      // clean headline rather than a sentence that says nothing.
      out.push({ id: candidate.id, note: "" });
    }
  }
  return out;
}

/** Newest first, then veterans — the set still changes daily because the pools do. */
function fallbackPicks(fresh: Candidate[], veteran: Candidate[]): { id: string; note: string }[] {
  const out = [
    ...fresh.slice(0, FRESH_QUOTA),
    ...veteran.slice(0, PICK_COUNT - FRESH_QUOTA),
  ].map((c) => ({ id: c.id, note: "" }));
  return out.slice(0, PICK_COUNT);
}

const COLS = "id, title, excerpt, category, category_slug, image_url, published_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = adminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const pickDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || "")) ? String(body.date) : israelToday();

    // Idempotent: the cron can fire twice without reshuffling a page readers
    // are already looking at.
    const { data: existing } = await supabase
      .from("editors_picks")
      .select("article_id, rank, note")
      .eq("pick_date", pickDate)
      .order("rank");
    if ((existing?.length ?? 0) > 0 && !body?.force) {
      return json({ ok: true, pickDate, skipped: true, reason: "כבר קיימת בחירה ליום הזה", picks: existing });
    }

    // Everything picked recently is off the table. This is what makes the
    // section look tended rather than generated.
    const { data: recent } = await supabase
      .from("editors_picks")
      .select("article_id")
      .gte("pick_date", new Date(Date.now() - NO_REPEAT_DAYS * 24 * 3600_000).toISOString().slice(0, 10));
    const blocked = new Set((recent ?? []).map((r: any) => r.article_id));

    const { data: pool, error: poolErr } = await supabase
      .from("articles")
      .select(COLS)
      .eq("is_draft", false)
      .neq("category_slug", "marketing")
      .gte("published_at", daysAgo(21))
      .order("published_at", { ascending: false })
      .limit(200);
    if (poolErr) throw new Error(`שליפת הכתבות נכשלה: ${poolErr.message}`);

    const usable = ((pool ?? []) as Candidate[]).filter(
      (a) => a.published_at && hasRealImage(a.image_url) && !blocked.has(a.id),
    );

    const freshCutoff = daysAgo(2);
    let fresh = usable.filter((a) => a.published_at >= freshCutoff);
    // A quiet weekend can leave the 48-hour window thin; widen rather than
    // publish a half-empty section.
    if (fresh.length < FRESH_QUOTA) fresh = usable.filter((a) => a.published_at >= daysAgo(4));
    const freshIds = new Set(fresh.map((a) => a.id));
    const veteran = usable.filter((a) => !freshIds.has(a.id));

    if (fresh.length + veteran.length < PICK_COUNT) {
      return json({ error: `אין מספיק כתבות מועמדות (${fresh.length + veteran.length})`, pickDate }, 409);
    }

    const byId = new Map(usable.map((a) => [a.id, a]));
    let chosen: { id: string; note: string }[] = [];
    let source = "model";
    try {
      chosen = validate(await chooseWithModel(fresh.slice(0, 25), veteran.slice(0, 25)), byId);
    } catch (e) {
      console.error("model pick failed", (e as Error).message);
    }
    if (chosen.length < FRESH_QUOTA) {
      console.log(`נפילה לבחירה דטרמיניסטית (המודל החזיר ${chosen.length})`);
      chosen = fallbackPicks(fresh, veteran);
      source = "fallback";
    } else if (chosen.length < PICK_COUNT) {
      chosen = topUp(chosen, [fresh, veteran]);
      source = "model+topup";
    }

    await supabase.from("editors_picks").delete().eq("pick_date", pickDate);
    const rows = chosen.map((c, i) => ({
      pick_date: pickDate,
      article_id: c.id,
      rank: i + 1,
      note: c.note || null,
    }));
    const { error: insErr } = await supabase.from("editors_picks").insert(rows);
    if (insErr) throw new Error(`שמירת הבחירה נכשלה: ${insErr.message}`);

    return json({
      ok: true,
      pickDate,
      source,
      day: fmtDay(new Date().toISOString()),
      picks: rows.map((r) => ({
        rank: r.rank,
        title: byId.get(r.article_id)?.title,
        category: byId.get(r.article_id)?.category,
        note: r.note,
      })),
      poolSizes: { fresh: fresh.length, veteran: veteran.length, blocked: blocked.size },
    });
  } catch (e: any) {
    console.error("editors-picks error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
