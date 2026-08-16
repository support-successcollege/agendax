import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const articleId = url.searchParams.get("id");

    if (!articleId) {
      return new Response("Missing article id", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: article, error } = await supabase
      .from("articles")
      .select("id, title, excerpt, image_url, date, author, category")
      .eq("id", articleId)
      .eq("is_draft", false)
      .single();

    if (error || !article) {
      return new Response("Article not found", { status: 404 });
    }

    const siteUrl = "https://yznews.store";
    const articleUrl = `${siteUrl}/article/${article.id}`;
    const publishedDate = new Date(article.date).toISOString();
    const shareImage = socialImage(article.image_url);

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(article.title)} | YZ News</title>
  <meta name="description" content="${escapeHtml(article.excerpt)}" />
  
  <meta property="og:title" content="${escapeHtml(article.title)}" />
  <meta property="og:description" content="${escapeHtml(article.excerpt)}" />
  <meta property="og:image" content="${escapeHtml(shareImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(shareImage)}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="420" />
  <meta property="og:image:alt" content="${escapeHtml(article.title)}" />
  <meta property="og:url" content="${articleUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="YZ News" />
  <meta property="og:locale" content="he_IL" />
  <meta property="article:published_time" content="${publishedDate}" />
  <meta property="article:author" content="${escapeHtml(article.author)}" />
  <meta property="article:section" content="${escapeHtml(article.category)}" />
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(article.title)}" />
  <meta name="twitter:description" content="${escapeHtml(article.excerpt)}" />
  <meta name="twitter:image" content="${escapeHtml(shareImage)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(article.title)}" />

  
  <link rel="canonical" href="${articleUrl}" />
  
  <!-- Redirect browsers to the actual page -->
  <meta http-equiv="refresh" content="0;url=${articleUrl}" />
</head>
<body>
  <p>מפנה ל: <a href="${articleUrl}">${escapeHtml(article.title)}</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const FALLBACK_IMAGE =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/1PaTcUnJQyWhm7SOLQvBN3lUgPm2/social-images/social-1775731097302-%D7%9C%D7%95%D7%92%D7%95_%D7%A0%D7%99%D7%95%D7%96.webp";

/**
 * Build a social-preview friendly image URL: 800x420, quality 80 (under WhatsApp's ~600KB preview limit).
 * Keeps WhatsApp/Facebook size limits satisfied (originals can be several MB).
 */
function socialImage(url?: string | null): string {
  if (!url || typeof url !== "string") return FALLBACK_IMAGE;
  const publicMarker = "/storage/v1/object/public/";
  if (!url.includes(publicMarker)) return url;
  const base = url.replace(publicMarker, "/storage/v1/render/image/public/");
  return `${base}?width=800&height=420&resize=cover&quality=80`;
}
