// deno-lint-ignore-file no-explicit-any
// The morning data pass behind two homepage sections, run daily at 06:40
// Israel:
//   1. daily_briefs — "5 דברים שצריך לדעת הבוקר": five bullets summarizing
//      the last day's articles, each linking to its article.
//   2. funding_deals — the גיוסים-ואקזיטים table: any funding round, exit,
//      M&A or IPO mentioned in those articles, as a structured row.
// Body: { date?: "YYYY-MM-DD" } (defaults to today, Israel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, callModel, corsHeaders, htmlToText, json, toolArgs } from "../_shared/ingest.ts";

const TZ = "Asia/Jerusalem";

function israelDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

type ArticleRow = { id: string; slug: string | null; title: string; excerpt: string; content: string; category: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const day = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : israelDate(new Date());

    const since = new Date(Date.now() - 26 * 3600_000).toISOString();
    const { data } = await supabase
      .from("articles")
      .select("id, slug, title, excerpt, content, category")
      .eq("is_draft", false)
      .neq("category_slug", "marketing")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(14);
    const articles = (data ?? []) as ArticleRow[];
    if (articles.length === 0) return json({ ok: true, skipped: "אין כתבות מהיממה האחרונה" });

    const corpus = articles
      .map((a, i) => `[${i}] (${a.category}) ${a.title}\n${a.excerpt}\n${htmlToText(a.content || "").slice(0, 1200)}`)
      .join("\n\n---\n\n");

    // ---- 1. The five-bullet brief -----------------------------------------
    const briefResp = await callModel({
      messages: [
        {
          role: "system",
          content: `אתה עורך התקציר היומי של אתר חדשות הייטק ישראלי. מהכתבות של היממה האחרונה בנה את "5 דברים שצריך לדעת הבוקר".

כללים:
- בדיוק 5 פריטים (אם יש פחות מ-5 כתבות — פריט לכתבה).
- כל פריט: משפט אחד חד, עד 25 מילים, בעברית. פתיחה ב-2-4 מילים מודגשות שתופסות את הלב (יסומנו בכוכביות: **כך**).
- גוון בין קטגוריות; הידיעה הכי חשובה ראשונה.
- article_index: מספר הכתבה שהפריט מבוסס עליה.
- בלי המצאות — רק ממה שבכתבות.

החזר רק דרך הכלי write_brief.`,
        },
        { role: "user", content: corpus },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "write_brief",
            description: "חמשת הפריטים של תקציר הבוקר",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      article_index: { type: "integer" },
                    },
                    required: ["text", "article_index"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "write_brief" } },
    });

    const briefItems = (((toolArgs(briefResp).items as any[]) || []))
      .filter((it) => it?.text)
      .slice(0, 5)
      .map((it) => {
        const a = articles[Number(it.article_index)] ?? null;
        return { text: String(it.text).slice(0, 300), article_id: a?.id ?? null, slug: a?.slug ?? null };
      });

    let briefSaved = false;
    if (briefItems.length >= 3) {
      const { error } = await supabase
        .from("daily_briefs")
        .upsert({ brief_date: day, items: briefItems, created_at: new Date().toISOString() }, { onConflict: "brief_date" });
      if (error) console.error("daily_briefs upsert failed", error.message);
      else briefSaved = true;
    }

    // ---- 2. Deals ----------------------------------------------------------
    const dealsResp = await callModel({
      messages: [
        {
          role: "system",
          content: `אתה מחלץ עסקאות מכתבות חדשות הייטק: סבבי גיוס, אקזיטים, מיזוגים ורכישות, הנפקות.

כללים:
- רק עסקה שמופיעה במפורש באחת הכתבות. אין עסקאות — החזר רשימה ריקה.
- company: שם החברה המגייסת/הנרכשת. kind: funding / exit / ma / ipo.
- amount_label: הסכום כמו שכתוב ("120 מיליון דולר"); לא צוין — השאר ריק.
- round: שם הסבב אם צוין (Seed, A, B...). investors: משקיעים/רוכשת מובילים, עד 3, מופרדים בפסיק.
- article_index: מספר הכתבה.

החזר רק דרך הכלי extract_deals.`,
        },
        { role: "user", content: corpus },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_deals",
            description: "עסקאות שחולצו מהכתבות",
            parameters: {
              type: "object",
              properties: {
                deals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      company: { type: "string" },
                      kind: { type: "string", enum: ["funding", "exit", "ma", "ipo"] },
                      amount_label: { type: "string" },
                      round: { type: "string" },
                      investors: { type: "string" },
                      article_index: { type: "integer" },
                    },
                    required: ["company", "kind", "article_index"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["deals"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_deals" } },
    });

    const dealRows = (((toolArgs(dealsResp).deals as any[]) || []))
      .filter((d) => d?.company && ["funding", "exit", "ma", "ipo"].includes(d?.kind))
      .slice(0, 12)
      .map((d) => ({
        company: String(d.company).slice(0, 120),
        kind: d.kind,
        amount_label: d.amount_label ? String(d.amount_label).slice(0, 80) : null,
        round: d.round ? String(d.round).slice(0, 40) : null,
        investors: d.investors ? String(d.investors).slice(0, 200) : null,
        article_id: articles[Number(d.article_index)]?.id ?? null,
        announced_on: day,
      }));

    let dealsSaved = 0;
    if (dealRows.length) {
      const { error, count } = await supabase
        .from("funding_deals")
        .upsert(dealRows, { onConflict: "company,announced_on,kind", count: "exact" });
      if (error) console.error("funding_deals upsert failed", error.message);
      else dealsSaved = count ?? dealRows.length;
    }

    return json({ ok: true, day, articles: articles.length, brief: briefSaved ? briefItems.length : 0, deals: dealsSaved });
  } catch (e: any) {
    console.error("morning-brief error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
