// deno-lint-ignore-file no-explicit-any
// "כתבה שיווקית": takes a website URL, scrapes it (homepage plus a couple of
// obvious about/services pages), has the model write a Hebrew marketing
// article about the business, and saves it as a DRAFT under the dedicated
// "כתבה שיווקית" category. The editor reviews and publishes from the panel.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  FALLBACK_IMAGE,
  adminClient,
  authorize,
  callModel,
  corsHeaders,
  generateImage,
  htmlToText,
  json,
  mdToArticleHtml,
  toolArgs,
} from "../_shared/ingest.ts";

const MARKETING_CATEGORY = { name: "כתבה שיווקית", slug: "marketing" };

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "he,en;q=0.8",
};

async function fetchHtml(url: string, timeoutMs = 15000): Promise<{ url: string; html: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: BROWSER_HEADERS });
    clearTimeout(t);
    if (!resp.ok) return null;
    const type = (resp.headers.get("content-type") || "").toLowerCase();
    if (type && !type.includes("html")) return null;
    return { url: resp.url || url, html: await resp.text() };
  } catch (e) {
    console.error("fetchHtml failed", url, (e as Error).message);
    return null;
  }
}

function metaOf(html: string): { title: string; description: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
    "";
  return { title: htmlToText(title), description: htmlToText(description) };
}

/** Internal links that look like about/services/products pages — the pages
 * that actually explain what the business does. */
function interestingLinks(html: string, baseUrl: string, max = 2): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const out: string[] = [];
  const WANT = /about|אודות|services|שירות|מוצר|products|solutions|פתרונות|מי-אנחנו|whoweare|company/i;
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const label = htmlToText(m[2] || "");
    if (!WANT.test(href) && !WANT.test(label)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname !== base.hostname) continue;
      const key = u.pathname.toLowerCase();
      if (seen.has(key) || key === "/" || key === base.pathname.toLowerCase()) continue;
      seen.add(key);
      out.push(u.toString());
      if (out.length >= max) break;
    } catch { /* bad href — skip */ }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    let siteUrl = String(body?.url || "").trim();
    if (!siteUrl) return json({ error: "יש להזין כתובת אתר" }, 400);
    if (!/^https?:\/\//i.test(siteUrl)) siteUrl = `https://${siteUrl}`;
    try {
      new URL(siteUrl);
    } catch {
      return json({ error: "כתובת האתר אינה תקינה" }, 400);
    }

    // --- Scrape: homepage + up to two about/services pages -----------------
    const home = await fetchHtml(siteUrl);
    if (!home) {
      return json({ error: "לא הצלחנו לגשת לאתר. בדקו שהכתובת נכונה ושהאתר זמין." }, 422);
    }
    const meta = metaOf(home.html);
    const blocks: string[] = [
      `### דף הבית (${home.url})\nכותרת: ${meta.title}\nתיאור: ${meta.description}\n\n${htmlToText(home.html).slice(0, 9000)}`,
    ];
    for (const link of interestingLinks(home.html, home.url)) {
      const page = await fetchHtml(link);
      if (page) blocks.push(`### עמוד נוסף (${page.url})\n\n${htmlToText(page.html).slice(0, 5000)}`);
    }
    const research = blocks.join("\n\n---\n\n");
    if (research.replace(/\s+/g, " ").length < 400) {
      return json({ error: "האתר כמעט ריק מטקסט (ייתכן שנטען רק ב-JavaScript) — אין מספיק חומר לכתבה." }, 422);
    }

    // --- Write the marketing article ---------------------------------------
    const system = `אתה קופירייטר וכתב תוכן שיווקי בכיר בעברית עבור Agendax. קיבלת את תוכן האתר של עסק. כתוב כתבה שיווקית (advertorial) מקצועית ואטרקטיבית על העסק, המבוססת אך ורק על תוכן האתר המצורף.

דרישות:
- טון שיווקי-עיתונאי: מציג את העסק, הערך שהוא נותן, למי הוא מתאים ולמה כדאי להכיר אותו. חיובי ומזמין אך לא צעקני.
- מבנה: פתיח שמושך, מי העסק ומה הוא מציע, מה מייחד אותו, למי זה מתאים, וסיום עם קריאה לפעולה שמפנה לאתר.
- **אורך: 400-700 מילים**, עם **לפחות 2 כותרות משנה** במרקדאון (## כותרת).
- רשימות bullet כשמתאים, **bold** להדגשות. מרקדאון נקי, בלי code fences.
- **אל תמציא.** כל עובדה, שירות, מספר ושם חייבים להופיע בתוכן האתר. מה שלא כתוב באתר — לא קיים.
- שלב את כתובת האתר כקישור בקריאה לפעולה בסוף: [שם העסק](${siteUrl}).
- צור פרומפט באנגלית לתמונה שיווקית ריאליסטית שמתאימה לתחום העסק (photorealistic, no text).

החזר רק דרך הכלי write_article.`;

    const data = await callModel({
      messages: [
        { role: "system", content: system },
        { role: "user", content: `כתובת האתר: ${siteUrl}\n\n=== תוכן האתר ===\n\n${research}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "write_article",
            description: "מחזיר כתבה שיווקית בעברית",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "כותרת שיווקית חדה (עד 12 מילים)" },
                subtitle: { type: "string", description: "משפט-שניים של תקציר מושך" },
                body: { type: "string", description: "גוף הכתבה במרקדאון GFM, 400-700 מילים" },
                image_prompt: { type: "string", description: "פרומפט באנגלית לתמונה שיווקית" },
              },
              required: ["title", "subtitle", "body", "image_prompt"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "write_article" } },
    });
    const article = toolArgs(data as any) as {
      title?: string;
      subtitle?: string;
      body?: string;
      image_prompt?: string;
    };
    if (!article.title || !article.body) return json({ error: "המודל לא החזיר כתבה תקינה" }, 500);

    const supabase = adminClient();

    // --- Make sure the dedicated category exists (kept out of the navbar) --
    const { data: existingCat } = await supabase
      .from("categories")
      .select("name, slug")
      .eq("slug", MARKETING_CATEGORY.slug)
      .maybeSingle();
    if (!existingCat) {
      const { error: catErr } = await supabase
        .from("categories")
        .insert({ ...MARKETING_CATEGORY, is_active: false, display_order: 99 });
      if (catErr) console.error("category insert failed", catErr);
    }

    // --- Image --------------------------------------------------------------
    const imageUrl = (await generateImage(supabase, article.image_prompt || article.title)) ?? FALLBACK_IMAGE;

    // --- Save as draft ------------------------------------------------------
    const { data: inserted, error: insertErr } = await supabase
      .from("articles")
      .insert({
        title: article.title.slice(0, 300),
        excerpt: article.subtitle || "",
        content: mdToArticleHtml(article.body),
        category: MARKETING_CATEGORY.name,
        category_slug: MARKETING_CATEGORY.slug,
        image_url: imageUrl,
        author: "מערכת Agendax",
        is_draft: true,
        is_breaking: false,
        is_featured: false,
        source_url: siteUrl,
        source_name: new URL(siteUrl).hostname.replace(/^www\./, ""),
      })
      .select("id, title")
      .single();
    if (insertErr) return json({ error: `שמירת הטיוטה נכשלה: ${insertErr.message}` }, 500);

    return json({
      ok: true,
      articleId: inserted.id,
      title: inserted.title,
      excerpt: article.subtitle,
      imageUrl,
    });
  } catch (e: any) {
    console.error("marketing-article error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
