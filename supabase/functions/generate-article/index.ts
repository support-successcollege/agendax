// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { marked } from "https://esm.sh/marked@12.0.2";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveAndFetch(url: string, timeoutMs = 12000): Promise<{ url: string; text: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgendaxBot/1.0; +https://agendax.co.il)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "he,en;q=0.8",
      },
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = htmlToText(html).slice(0, 8000);
    if (text.length < 200) return null;
    return { url: resp.url || url, text };
  } catch (e) {
    console.error("resolveAndFetch failed", url, (e as Error).message);
    return null;
  }
}

async function fetchRss(rssUrl: string) {
  try {
    const r = await fetch(rssUrl);
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12);
    return items
      .map((m) => {
        const block = m[1];
        const get = (tag: string) => {
          const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
          return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
        };
        const title = get("title");
        const link = get("link");
        const pubDate = get("pubDate");
        const descRaw = get("description");
        const desc = descRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return { title, link, pubDate, desc };
      })
      .filter((it) => it.title && it.link);
  } catch (e) {
    console.error("RSS error", rssUrl, e);
    return [];
  }
}

function mdToArticleHtml(md: string): string {
  let cleaned = (md || "").trim();
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  marked.setOptions({ gfm: true, breaks: true });
  let html = marked.parse(cleaned) as string;
  html = html
    .replace(/<h1>/g, '<h1 class="text-3xl md:text-4xl font-bold text-foreground mt-8 mb-4">')
    .replace(/<h2>/g, '<h2 class="text-2xl md:text-3xl font-bold text-foreground mt-8 mb-4 border-b-2 border-primary/20 pb-2">')
    .replace(/<h3>/g, '<h3 class="text-xl md:text-2xl font-bold text-foreground mt-6 mb-3">')
    .replace(/<h4>/g, '<h4 class="text-lg font-bold text-foreground mt-4 mb-2">')
    .replace(/<p>/g, '<p class="text-foreground/90 leading-relaxed mb-4">')
    .replace(/<ul>/g, '<ul class="list-disc pr-6 space-y-2 my-4 text-foreground/90">')
    .replace(/<ol>/g, '<ol class="list-decimal pr-6 space-y-2 my-4 text-foreground/90">')
    .replace(/<li>/g, '<li class="leading-relaxed">')
    .replace(/<blockquote>/g, '<blockquote class="border-r-4 border-primary pr-4 my-6 italic text-foreground/75 bg-muted/30 py-4 rounded-l-lg">')
    .replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80" ')
    .replace(/<strong>/g, '<strong class="font-bold text-foreground">')
    .replace(/<table>/g, '<div class="overflow-x-auto my-6"><table class="w-full border-collapse border border-border text-sm">')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<thead>/g, '<thead class="bg-muted">')
    .replace(/<th>/g, '<th class="border border-border px-3 py-2 text-right font-bold">')
    .replace(/<td>/g, '<td class="border border-border px-3 py-2 text-right">')
    .replace(/<hr>/g, '<hr class="my-8 border-border" />');
  return html;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return json({ error: "Unauthorized" }, 401);
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: data.claims.sub,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "Forbidden: admin role required" }, 403);
  return null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const { topic } = await req.json();
    if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
      return json({ error: "יש לספק נושא או ידיעה" }, 400);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY חסר" }, 500);

    const today = new Date().toISOString().slice(0, 10);

    // === Step 1a: Extract Hebrew search query from topic ===
    const queryResp = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        messages: [
          { role: "system", content: "החזר מחרוזת חיפוש קצרה (3-7 מילים) בעברית עבור Google News, ללא מרכאות וללא הסבר. רק המילים." },
          { role: "user", content: topic },
        ],
      }),
    });
    let query = topic;
    if (queryResp.ok) {
      const qd = await queryResp.json();
      const q = qd.choices?.[0]?.message?.content?.trim();
      if (q) query = q.replace(/^["']|["']$/g, "").slice(0, 200);
    }

    // === Step 1b: Classify topic ===
    let classification: { isFinancial: boolean; company: string | null; reportType: string | null } = {
      isFinancial: false, company: null, reportType: null,
    };
    try {
      const clsResp = await fetch(AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-3.6-flash",
          messages: [
            { role: "system", content: 'סווג את הנושא. החזר JSON תקין בלבד: {"isFinancial": boolean, "company": string|null, "reportType": "רבעוני"|"שנתי"|"חצי-שנתי"|"מיידי"|null}. isFinancial=true אם זה דוח כספי / תוצאות חברה / רווחים / הכנסות / דיווח מאיה.' },
            { role: "user", content: topic },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (clsResp.ok) {
        const cd = await clsResp.json();
        const raw = cd.choices?.[0]?.message?.content?.trim() || "{}";
        classification = { ...classification, ...JSON.parse(raw) };
      }
    } catch (e) { console.error("classify error", e); }
    console.log("classification:", classification);

    // === Step 1c: Google News RSS ===
    const rssMain = await fetchRss(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:7d")}&hl=he&gl=IL&ceid=IL:he`
    );
    let parsed = rssMain;

    if (classification.isFinancial && classification.company) {
      const mayaRss = await fetchRss(
        `https://news.google.com/rss/search?q=${encodeURIComponent(classification.company + " site:maya.tase.co.il")}&hl=he&gl=IL&ceid=IL:he`
      );
      const irRss = await fetchRss(
        `https://news.google.com/rss/search?q=${encodeURIComponent(classification.company + " דוח כספי")}&hl=he&gl=IL&ceid=IL:he`
      );
      parsed = [...mayaRss.slice(0, 4), ...irRss.slice(0, 4), ...rssMain].slice(0, 14);
    }

    let sources: { title: string; url: string }[] = parsed.slice(0, 8).map((p) => ({ title: p.title, url: p.link }));
    let researchText = parsed
      .map((p, i) => `[${i + 1}] ${p.title}\nתאריך: ${p.pubDate}\nתקציר: ${p.desc}\nקישור: ${p.link}`)
      .join("\n\n");

    // === Step 1d: Deep fetch full content of top sources ===
    const toFetch = parsed.slice(0, classification.isFinancial ? 4 : 2);
    const fullTexts = await Promise.all(toFetch.map((p) => resolveAndFetch(p.link)));
    const deepBlocks = fullTexts
      .map((r, i) => (r ? `### מקור מלא ${i + 1}: ${toFetch[i].title}\nכתובת: ${r.url}\n\n${r.text}` : null))
      .filter(Boolean) as string[];

    if (deepBlocks.length > 0) {
      researchText += `\n\n=== תוכן מלא של מקורות מובילים ===\n\n${deepBlocks.join("\n\n---\n\n")}`;
    }

    if (!researchText) {
      researchText = `לא נמצאו תוצאות חיפוש עדכניות. הסתמך על הידיעה המקורית בלבד וציין שהמידע מוגבל.`;
    }

    // === Step 2: Compose Hebrew journalistic article from research ===
    const researchSystem = `היום ${today}. אתה כתב חדשות בכיר וכתב כלכלי בעברית. קיבלת תוצאות מחקר עדכניות מהרשת. נסח כתבה עיתונאית-חדשותית מעמיקה ומקיפה ברמה מקצועית גבוהה בעברית תקנית, המבוססת אך ורק על המידע במחקר.

דרישות כלליות:
- מבנה פירמידה הפוכה: לידה חזק, עיקרי הדברים, פירוט, הקשר, רקע, השלכות, סיום.
- **אורך: 800-1400 מילים** בגוף הכתבה — כתבה מקיפה ומעמיקה, לא תקציר.
- חובה לכלול **לפחות 3 כותרות משנה** במרקדאון (## כותרת משנה) לפי נושאי משנה (למשל: "התוצאות הכספיות", "תחזית להמשך", "תגובות בשוק", "רקע").
- השתמש ברשימות bullet (- פריט) כשמתאים, ב-**bold** להדגשות, וב-> לציטוטים.
- אל תעטוף את הפלט ב-code fences, החזר מרקדאון נקי בלבד בשדה body.
- שפה רהוטה, אובייקטיבית, ללא דעות.
- שלב במלואם נתונים מספריים, אחוזים, תאריכים, שמות וציטוטים מהמחקר.

**אם הכתבה עוסקת בדוח כספי / תוצאות חברה / נתונים פיננסיים / מאקרו:**
- העדף את "תוכן מלא של מקורות מובילים" על פני התקצירים — שם הנתונים המדויקים מהדוח עצמו (מאיה / אתר החברה / כלכליסט / גלובס).
- סקור את **כל** הסעיפים המרכזיים של הדוח: הכנסות, רווח גולמי, רווח תפעולי, EBITDA, רווח נקי, תזרים מפעילות, הון עצמי, חוב פיננסי, מזומנים.
- כלול לפחות **טבלת מרקדאון אחת** (GFM) שמסכמת את הנתונים המרכזיים מול תקופה מקבילה.
- הצג שינויים באחוזים (YoY / QoQ) וביחס לתחזיות אנליסטים אם קיימים.
- צטט **דברי הנהלה / מנכ"ל / סמנכ"ל כספים** מתוך הדוח אם מופיעים בתוכן המלא (ב-> בלוקים).
- ציין סיכונים, צפי קדימה (guidance), דיבידנד, ורכישות עצמיות אם הוזכרו.
- כלול תגובת שוק (תנועת המניה, שווי שוק) אם זמינה.

- אל תמציא עובדות, מספרים או ציטוטים שלא מופיעים במחקר. אם נתון חסר — דלג עליו.
- צור פרומפט באנגלית לתמונה חדשותית ריאליסטית (photojournalism, editorial, realistic, no text).

בנוסף, החזר שדה category בעברית מתוך הרשימה: חדשות, טכנולוגיה, כלכלה, פוליטיקה, אקטואליה, שוק ההון.

החזר רק דרך הכלי write_article.`;

    const articleResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        messages: [
          { role: "system", content: researchSystem },
          {
            role: "user",
            content: `הידיעה המקורית:\n${topic}\n\n---\n\nתוצאות מחקר עדכניות מהרשת:\n${researchText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "write_article",
              description: "מחזיר כתבה עיתונאית מנוסחת בעברית ופרומפט תמונה",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "כותרת ראשית חדה (עד 12 מילים)" },
                  subtitle: { type: "string", description: "כותרת משנה / לידה (1-2 משפטים)" },
                  body: { type: "string", description: "גוף הכתבה במרקדאון GFM, 800-1400 מילים" },
                  category: { type: "string", description: "קטגוריה בעברית: חדשות / טכנולוגיה / כלכלה / פוליטיקה / אקטואליה / שוק ההון" },
                  image_prompt: { type: "string", description: "פרומפט באנגלית להפקת תמונה חדשותית ריאליסטית" },
                  key_facts: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 עובדות מפתח קצרות מהכתבה",
                  },
                },
                required: ["title", "subtitle", "body", "category", "image_prompt", "key_facts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_article" } },
      }),
    });

    if (!articleResp.ok) {
      const t = await articleResp.text();
      console.error("AI article error", articleResp.status, t);
      if (articleResp.status === 429) return json({ error: "חריגה ממכסת הבקשות, נסה שוב בעוד רגע" }, 429);
      if (articleResp.status === 402) return json({ error: "חריגה ממכסת ה-API של Gemini, נסו שוב מאוחר יותר" }, 402);
      return json({ error: `שגיאה בניסוח הכתבה (Gemini ${articleResp.status}): ${t.slice(0, 300)}` }, 500);
    }

    const articleData = await articleResp.json();
    const toolCall = articleData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call", JSON.stringify(articleData));
      return json({ error: "המודל לא החזיר כתבה תקינה" }, 500);
    }
    const article = JSON.parse(toolCall.function.arguments);

    // === Step 3: Generate image ===
    // Higgsfield Soul first (photoreal editorial quality, paid credits), then
    // Gemini's native generateContent as fallback, then the stock image.
    let imageUrl: string | null = null;
    try {
      const { generateImageHiggsfield } = await import("../_shared/ingest.ts");
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      imageUrl = await generateImageHiggsfield(
        admin,
        `${article.image_prompt}. Editorial photojournalism style, realistic, high quality, no text or watermarks, 16:9 composition.`,
      );
    } catch (e) {
      console.error("higgsfield step failed", e);
    }
    if (!imageUrl) try {
      const imgResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image"}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": GEMINI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${article.image_prompt}. Editorial photojournalism style, realistic, high quality, no text or watermarks, 16:9 composition.`,
                  },
                ],
              },
            ],
          }),
        },
      );
      if (imgResp.ok) {
        const imgData = await imgResp.json();
        const part = imgData.candidates?.[0]?.content?.parts?.find(
          (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
        );
        if (part) {
          const b64: string = part.inlineData.data;
          const mime: string = part.inlineData.mimeType || "image/png";
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

          const admin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const ext = mime.split("/")[1]?.split("+")[0] || "png";
          const path = `generated/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const { error: upErr } = await admin.storage
            .from("article-images")
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (upErr) {
            console.error("Image upload failed", upErr);
          } else {
            imageUrl = admin.storage.from("article-images").getPublicUrl(path).data.publicUrl;
          }
        }
      } else {
        console.error("Image gen failed", imgResp.status, await imgResp.text());
      }
    } catch (e) {
      console.error("Image gen exception", e);
    }

    // Append sources at the end of the body (markdown)
    let body = article.body || "";
    if (sources.length > 0) {
      const srcMd = sources
        .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
        .join("\n");
      body += `\n\n## מקורות\n\n${srcMd}`;
    }

    // Build excerpt from subtitle + key_facts fallback
    const excerpt =
      article.subtitle ||
      (Array.isArray(article.key_facts) ? article.key_facts.slice(0, 2).join(" ") : "");

    return json({
      title: article.title,
      excerpt,
      content: mdToArticleHtml(body),
      category: article.category || "חדשות",
      imageUrl: imageUrl ?? "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop",
      sources,
      key_facts: article.key_facts ?? [],
    });
  } catch (e: any) {
    console.error("generate-article error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
