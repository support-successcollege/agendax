// deno-lint-ignore-file no-explicit-any
// Refreshes the "כנסים ואירועים בתעשייה" homepage section: pulls the event
// calendars of IVC, events.co.il (אנשים ומחשבים) and the Innovation
// Authority once a day, has the model normalize them into structured rows,
// and upserts into industry_events. A source that fails (the Innovation
// Authority sits behind Cloudflare and only sometimes lets a server in) is
// skipped without failing the run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, callModel, corsHeaders, htmlToText, json, toolArgs } from "../_shared/ingest.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const SOURCES: { key: string; url: string; label: string }[] = [
  { key: "ivc", url: "https://www.ivc-online.com/Events", label: "IVC (לוח אירועי הייטק והשקעות, אנגלית)" },
  { key: "events_co_il", url: "https://events.co.il/events?locale=he", label: "אנשים ומחשבים events.co.il (עברית)" },
  { key: "innovation", url: "https://innovationisrael.org.il/event/", label: "רשות החדשנות (עברית)" },
];

async function fetchSourceText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "he,en;q=0.8" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    if (/Attention Required!\s*\|\s*Cloudflare|cf-challenge/i.test(html)) return null;
    const text = htmlToText(html).replace(/\s+/g, " ").trim();
    return text.length > 400 ? text.slice(0, 16_000) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const fetched = await Promise.all(SOURCES.map(async (s) => ({ ...s, text: await fetchSourceText(s.url) })));
    const usable = fetched.filter((s) => s.text);
    if (usable.length === 0) return json({ error: "אף מקור אירועים לא היה זמין" }, 502);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const corpus = usable
      .map((s) => `=== מקור: ${s.key} — ${s.label} (${s.url}) ===\n${s.text}`)
      .join("\n\n");

    const response = await callModel({
      messages: [
        {
          role: "system",
          content: `אתה מחלץ לוח כנסים ואירועי תעשייה (הייטק, AI, סייבר, הון סיכון, פינטק) מטקסט גולמי של דפי אינטרנט. היום ${today}.

כללים:
- החזר רק אירועים עתידיים (מהיום עד 90 יום קדימה) עם תאריך ברור. בלי אירועי עבר.
- date בפורמט YYYY-MM-DD. טקסט כמו "Sep. 07, 2026" או "שלישי, 8 בספטמבר 2026" — המר לפורמט.
- title: שם האירוע כפי שהוא (עברית או אנגלית — אל תתרגם).
- location: עיר/מקום אם צוין (קצר). time_label: שעות אם צוינו ("08:00-15:00").
- organizer: הגוף המארגן אם ברור מהטקסט, אחרת השאר ריק.
- source: המפתח של המקור שממנו האירוע (ivc / events_co_il / innovation).
- אל תמציא אירועים או תאריכים. ספק — דלג.
- דלג על כפילויות (אותו אירוע בשני מקורות — פעם אחת).
- עד 25 אירועים.

החזר רק דרך הכלי extract_events.`,
        },
        { role: "user", content: corpus },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_events",
            description: "אירועי תעשייה עתידיים שחולצו מהטקסט",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      date: { type: "string", description: "YYYY-MM-DD" },
                      time_label: { type: "string" },
                      location: { type: "string" },
                      organizer: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["title", "date", "source"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["events"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_events" } },
    });

    const raw = ((toolArgs(response).events as any[]) || []);
    const sourceUrl = new Map(SOURCES.map((s) => [s.key, s.url]));
    const todayMs = new Date(`${today}T00:00:00Z`).getTime();
    const rows = raw
      .filter((e) => e?.title && /^\d{4}-\d{2}-\d{2}$/.test(e?.date || ""))
      .filter((e) => {
        const t = new Date(`${e.date}T00:00:00Z`).getTime();
        return t >= todayMs && t <= todayMs + 90 * 24 * 3600_000;
      })
      .slice(0, 25)
      .map((e) => ({
        title: String(e.title).slice(0, 200),
        event_date: e.date,
        time_label: e.time_label ? String(e.time_label).slice(0, 60) : null,
        location: e.location ? String(e.location).slice(0, 160) : null,
        organizer: e.organizer ? String(e.organizer).slice(0, 120) : null,
        url: sourceUrl.get(e.source) ?? SOURCES[0].url,
        source: sourceUrl.has(e.source) ? e.source : "events_co_il",
        is_active: true,
        updated_at: new Date().toISOString(),
      }));

    let saved = 0;
    if (rows.length) {
      const { error, count } = await supabase
        .from("industry_events")
        .upsert(rows, { onConflict: "title,event_date", count: "exact" });
      if (error) throw new Error(`שמירת האירועים נכשלה: ${error.message}`);
      saved = count ?? rows.length;
    }

    // Yesterday's news is not a calendar: clear events that have passed.
    await supabase.from("industry_events").delete().lt("event_date", today);

    return json({
      ok: true,
      sources: fetched.map((s) => ({ key: s.key, ok: !!s.text })),
      extracted: raw.length,
      saved,
    });
  } catch (e: any) {
    console.error("industry-events error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
