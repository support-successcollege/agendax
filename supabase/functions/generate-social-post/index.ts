// deno-lint-ignore-file no-explicit-any
// Generates a social post for an article — the building block a future
// social-publishing automation calls headlessly.
//
// Callers: the admin panel (JWT) and, by design, automation (x-ingest-secret,
// same shared authorize as the pipeline). Two input shapes:
//   { articleId, platform? }          — the function loads the article itself;
//                                       all an automation needs is an id.
//   { title, excerpt, ... , url }     — legacy shape the admin dialogs send.
// Output is structured for machine use: { post, articleUrl, imageUrl,
// platform, hashtags } — text plus everything needed to actually publish.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, callModelWithFallback, corsHeaders, json } from "../_shared/ingest.ts";

const SITE_URL = "https://agendax.co.il";

const PLATFORM_STYLE: Record<string, string> = {
  facebook: "פוסט פייסבוק: 4-5 משפטים מעמיקים, אמוג'ים במידה, קריאה לפעולה.",
  linkedin: "פוסט לינקדאין: טון מקצועי-עסקי, 4-6 משפטים, בלי סלנג, אמוג'ים מעטים.",
  twitter: "פוסט X (טוויטר): עד 240 תווים לפני הלינק, חד ומסקרן.",
  instagram: "כיתוב אינסטגרם: 3-4 משפטים קליטים, אמוג'ים, שורת האשטגים עשירה.",
  whatsapp: "הודעת וואטסאפ לערוץ: 2-3 משפטים ישירים, אמוג'י פותח, בלי האשטגים.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const platform = String(body?.platform || "facebook").toLowerCase();
    const style = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.facebook;

    // Resolve the article: by id (automation path) or from the given fields.
    let title: string, excerpt: string, category: string, content: string, url: string, imageUrl: string | null;
    if (body?.articleId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: article, error } = await supabase
        .from("articles")
        .select("slug, id, title, excerpt, category, content, image_url")
        .eq("id", String(body.articleId))
        .single();
      if (error || !article) return json({ error: "הכתבה לא נמצאה" }, 404);
      title = article.title;
      excerpt = article.excerpt;
      category = article.category;
      content = article.content || "";
      imageUrl = article.image_url;
      url = `${SITE_URL}/article/${encodeURIComponent(article.slug || article.id)}`;
    } else {
      ({ title, excerpt, category } = body);
      content = body?.content || "";
      url = body?.url || SITE_URL;
      imageUrl = body?.imageUrl || null;
      if (!title) return json({ error: "חסרה כותרת או articleId" }, 400);
    }

    const plainContent = String(content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000);
    const wantHashtags = platform !== "whatsapp";

    const prompt = `אתה כותב תוכן לרשתות חברתיות עבור Agendax, אתר ישראלי המסקר הייטק, בינה מלאכותית, שוקי הון וחברות.

${style}

כללים:
- כתוב בעברית. אל תתייחס לתמונה או לתוכן חזותי.
- אל תמציא עובדות שלא מופיעות בפרטי הכתבה.
- סיים עם: 📖 לכתבה המלאה: ${url}
${wantHashtags ? "- אחרי הלינק, בשורה נפרדת אחרונה: לפחות 4 האשטגים בעברית." : "- בלי האשטגים."}
- החזר רק את הפוסט עצמו, בלי הערות.

פרטי הכתבה:
כותרת: ${title}
תקציר: ${excerpt}
קטגוריה: ${category}
תוכן: ${plainContent || "לא סופק"}`;

    const data = await callModelWithFallback({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    });
    const post: string = (data as any).choices?.[0]?.message?.content || "";
    if (!post) return json({ error: "המודל לא החזיר פוסט" }, 500);

    const hashtags = [...post.matchAll(/#[^\s#]+/g)].map((m) => m[0]);

    return json({ post, articleUrl: url, imageUrl, platform, hashtags });
  } catch (error: any) {
    console.error("Error generating social post:", error);
    return json({ error: error?.message || "שגיאה לא ידועה" }, 500);
  }
});
