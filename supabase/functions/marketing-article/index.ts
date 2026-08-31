// deno-lint-ignore-file no-explicit-any
// "כתבה שיווקית": takes a website URL, scrapes it (homepage plus a couple of
// obvious about/services pages), has the model write a Hebrew marketing
// article about the business, and saves it as a DRAFT under the dedicated
// "כתבה שיווקית" category. The editor reviews and publishes from the panel.
//
// The same run also assembles the rest of the placement:
//   • an on-site ad (a sidebar_widgets row, created switched OFF) pointing at
//     the article, so the campaign goes live the moment the editor flips it;
//   • the social copy, stored as pending social_posts rows — the publisher
//     uses that approved text verbatim instead of writing its own.
//
// Body: { url, createWidget?: boolean, prepareSocial?: boolean } — both default
// to true.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  FALLBACK_IMAGE,
  adminClient,
  authorize,
  callModelWithFallback,
  corsHeaders,
  generateImage,
  htmlToText,
  json,
  mdToArticleHtml,
  mirrorImageToBucket,
  toolArgs,
} from "../_shared/ingest.ts";
import { SITE_URL } from "../_shared/social.ts";

const MARKETING_CATEGORY = { name: "כתבה שיווקית", slug: "marketing" };

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "he,en;q=0.8",
};

/**
 * Marketing sites are heavy — a page builder's homepage runs to megabytes of
 * markup, and stripping tags out of that with regexes is what exhausts the
 * worker. Nothing past this cap carries information the article needs: the
 * headline, the pitch and the services all sit near the top of the document.
 */
const MAX_HTML_BYTES = 400_000;

/** Reads at most `limit` bytes of a response body, then drops the connection. */
async function readCapped(resp: Response, limit: number): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return (await resp.text()).slice(0, limit);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(total, limit));
  let at = 0;
  for (const chunk of chunks) {
    if (at >= buf.length) break;
    const take = Math.min(chunk.length, buf.length - at);
    buf.set(chunk.subarray(0, take), at);
    at += take;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

async function fetchHtml(url: string, timeoutMs = 12000): Promise<{ url: string; html: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: BROWSER_HEADERS });
    clearTimeout(t);
    if (!resp.ok) return null;
    const type = (resp.headers.get("content-type") || "").toLowerCase();
    if (type && !type.includes("html")) {
      await resp.body?.cancel();
      return null;
    }
    // Stop reading at the budget instead of buffering the whole document:
    // the cap has to save the download, not just the memory afterwards.
    const html = await readCapped(resp, MAX_HTML_BYTES);
    return { url: resp.url || url, html };
  } catch (e) {
    console.error("fetchHtml failed", url, (e as Error).message);
    return null;
  }
}

function metaOf(html: string): { title: string; description: string; image: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
    "";
  const image =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)?.[1] ??
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    "";
  return { title: htmlToText(title), description: htmlToText(description), image: image.trim() };
}

/** Internal links that look like about/services/products pages — the pages
 * that actually explain what the business does. */
function interestingLinks(html: string, baseUrl: string, max = 1): string[] {
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
    const createWidget = body?.createWidget !== false;
    const prepareSocial = body?.prepareSocial !== false;
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
    const homeText = htmlToText(home.html);
    const blocks: string[] = [
      `### דף הבית (${home.url})\nכותרת: ${meta.title}\nתיאור: ${meta.description}\n\n${homeText.slice(0, 7000)}`,
    ];
    for (const link of homeText.length >= 2500 ? [] : interestingLinks(home.html, home.url)) {
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

בנוסף לכתבה, הכן את שאר החומרים לקמפיין:
- widget_title: כותרת קצרה למודעה שתופיע באתר. עד 40 תווים, אומרת מה העסק נותן.
- widget_description: שורת מכירה אחת, עד 90 תווים. בלי סופרלטיבים ריקים.
- widget_cta: טקסט לכפתור, עד 18 תווים ("לפרטים נוספים", "דברו איתנו").
- social_post: פוסט לרשתות בעברית — 2-4 שורות שמסקרנות ומסבירות מה העסק עושה, ואז שורה אחרונה עם 4 האשטגים. אל תוסיף קישור, המערכת מוסיפה אותו.

החזר רק דרך הכלי write_article.`;

    const data = await callModelWithFallback({
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
                widget_title: { type: "string", description: "כותרת למודעה באתר, עד 40 תווים" },
              widget_description: { type: "string", description: "שורת מכירה אחת למודעה, עד 90 תווים" },
              widget_cta: { type: "string", description: "טקסט לכפתור המודעה, עד 18 תווים" },
              social_post: {
                type: "string",
                description: "פוסט לרשתות בעברית: 2-4 שורות + 4 האשטגים בשורה אחרונה. בלי קישור — המערכת מוסיפה אותו.",
              },
              image_prompt: { type: "string", description: "פרומפט באנגלית לתמונה שיווקית" },
              },
              required: [
                "title",
                "subtitle",
                "body",
                "image_prompt",
                "widget_title",
                "widget_description",
                "widget_cta",
                "social_post",
              ],
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
      widget_title?: string;
      widget_description?: string;
      widget_cta?: string;
      social_post?: string;
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
    // The business's own og:image beats a drawn one on both counts: it shows
    // the actual product, and mirroring it takes a second where generating
    // takes closer to a minute — the difference between finishing inside the
    // edge runtime's request window and timing out with nothing saved.
    let imageUrl: string | null = null;
    if (meta.image) {
      try {
        imageUrl = await mirrorImageToBucket(supabase, new URL(meta.image, home.url).toString());
      } catch (e) {
        console.error("og:image mirror failed", (e as Error).message);
      }
    }
    imageUrl ??= (await generateImage(supabase, article.image_prompt || article.title)) ?? FALLBACK_IMAGE;

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

    const articleUrl = `${SITE_URL}/article/${inserted.id}`;

    // --- The on-site ad -----------------------------------------------------
    // Created switched OFF: the campaign starts when the editor flips it on,
    // not the moment the copy exists.
    let widgetId: string | null = null;
    if (createWidget) {
      const { data: widget, error: widgetErr } = await supabase
        .from("sidebar_widgets")
        .insert({
          title: (article.widget_title || inserted.title).slice(0, 80),
          description: (article.widget_description || article.subtitle || "").slice(0, 200),
          link_url: articleUrl,
          button_text: (article.widget_cta || "לפרטים נוספים").slice(0, 30),
          icon: "📣",
          image_url: imageUrl,
          // Both surfaces at once — the editor narrows it in the widgets tab.
          widget_type: "card,banner",
          action_type: "link",
          is_active: false,
          display_order: 0,
        })
        .select("id")
        .single();
      if (widgetErr) console.error("widget insert failed", widgetErr);
      else widgetId = widget.id;
    }

    // --- The social copy ----------------------------------------------------
    // Stored as pending rows: social-publish uses this approved text verbatim
    // rather than writing its own, and the editor can see it before it goes.
    let socialPrepared = 0;
    const socialText = (article.social_post || "").trim();
    if (prepareSocial && socialText) {
      const { data: accounts } = await supabase
        .from("social_accounts")
        .select("platform")
        .eq("enabled", true);
      const platforms = (accounts ?? []).map((a: { platform: string }) => a.platform);
      if (platforms.length > 0) {
        // Instagram shows no clickable link in a caption, so it does not get one.
        const rows = platforms.map((platform) => ({
          article_id: inserted.id,
          platform,
          status: "pending",
          post_text: platform === "instagram" ? socialText : `${socialText}\n\n📖 ${articleUrl}`,
          error: null,
        }));
        const { error: socialErr, count } = await supabase
          .from("social_posts")
          .upsert(rows, { onConflict: "article_id,platform", count: "exact" });
        if (socialErr) console.error("social prepare failed", socialErr);
        else socialPrepared = count ?? rows.length;
      }
    }

    return json({
      ok: true,
      articleId: inserted.id,
      title: inserted.title,
      excerpt: article.subtitle,
      imageUrl,
      widgetId,
      socialPrepared,
      socialText,
    });
  } catch (e: any) {
    console.error("marketing-article error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
