// deno-lint-ignore-file no-explicit-any
// Rewrites an existing article with the writing agent: same facts, fresh
// prose. The editor triggers it per-article from the admin panel; the rewrite
// lands in place (draft stays draft, published stays published) and the old
// title/excerpt/body are simply replaced.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, callModelWithFallback, corsHeaders, json, mdToArticleHtml, toolArgs } from "../_shared/ingest.ts";

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const articleId = String(body?.articleId || "");
    const instructions = body?.instructions ? String(body.instructions).slice(0, 500) : null;
    if (!articleId) return json({ error: "חסר מזהה כתבה" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: article, error: loadErr } = await supabase
      .from("articles")
      .select("id, title, excerpt, content, category")
      .eq("id", articleId)
      .single();
    if (loadErr || !article) return json({ error: "הכתבה לא נמצאה" }, 404);

    const plain = stripHtml(article.content || "").slice(0, 14000);
    if (plain.length < 200) return json({ error: "הכתבה קצרה מדי לשכתוב" }, 400);

    const system = `אתה עורך לשוני בכיר באתר חדשות ישראלי. קיבלת כתבה קיימת. שכתב אותה מחדש: אותן עובדות בדיוק, ניסוח רענן, מבנה ברור יותר.

כללי ברזל:
- **אל תוסיף אף עובדה, מספר, שם או ציטוט** שלא מופיעים בכתבה המקורית. אל תשמיט עובדות מרכזיות.
- אל תזכיר מקורות, אתרים או כלי תקשורת בגוף הטקסט.
- שמור על אורך דומה למקור (±20%).
- מבנה: לידה חזק, כותרות משנה במרקדאון (##), רשימות והדגשות היכן שמתאים.
- החזר מרקדאון נקי בשדה body, בלי code fences ובלי H1.
${instructions ? `\nהנחיות נוספות מהעורך: ${instructions}` : ""}

החזר רק דרך הכלי rewrite_article.`;

    const response = await callModelWithFallback({
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `כותרת נוכחית: ${article.title}\nתקציר נוכחי: ${article.excerpt}\n\n=== גוף הכתבה ===\n${plain}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "rewrite_article",
            description: "מחזיר את הכתבה המשוכתבת",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "כותרת משופרת, עד 12 מילים" },
                excerpt: { type: "string", description: "תקציר / לידה של 1-2 משפטים" },
                body: { type: "string", description: "גוף הכתבה במרקדאון GFM" },
              },
              required: ["title", "excerpt", "body"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "rewrite_article" } },
    });

    const rewritten = toolArgs(response) as { title: string; excerpt: string; body: string };
    if (!rewritten.body || rewritten.body.length < 300) {
      return json({ error: "השכתוב החזיר תוכן קצר מדי — הכתבה לא שונתה" }, 422);
    }

    const { error: updateErr } = await supabase
      .from("articles")
      .update({
        title: rewritten.title.slice(0, 300),
        excerpt: rewritten.excerpt.slice(0, 400),
        content: mdToArticleHtml(rewritten.body),
      })
      .eq("id", articleId);
    if (updateErr) throw new Error(`שמירת השכתוב נכשלה: ${updateErr.message}`);

    return json({ ok: true, title: rewritten.title });
  } catch (e: any) {
    console.error("rewrite-article error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
