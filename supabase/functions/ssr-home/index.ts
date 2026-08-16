import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const siteUrl = "https://yznews.store";

    // Get latest published articles
    const { data: articles, error } = await supabase
      .from("articles")
      .select("id, title, excerpt, image_url, date, author, category, category_slug")
      .eq("is_draft", false)
      .order("date", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Get categories
    const { data: categories } = await supabase
      .from("categories")
      .select("name, slug")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    const articleListHtml = (articles || []).map(a => `
      <article>
        <h2><a href="${siteUrl}/article/${a.id}">${escapeHtml(a.title)}</a></h2>
        <p>${escapeHtml(a.excerpt)}</p>
        <p><time datetime="${new Date(a.date).toISOString()}">${new Date(a.date).toLocaleDateString("he-IL")}</time> | ${escapeHtml(a.author)} | ${escapeHtml(a.category)}</p>
        <img src="${escapeHtml(a.image_url)}" alt="${escapeHtml(a.title)}" loading="lazy" />
      </article>
    `).join("\n");

    const categoryLinksHtml = (categories || []).map(c =>
      `<a href="${siteUrl}/?category=${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`
    ).join(" | ");

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "YZ News",
      "url": siteUrl,
      "description": "YZ News - פורטל החדשות המוביל בישראל. חדשות חמות מעולם הטכנולוגיה, הכלכלה, שוק ההון והפוליטיקה.",
      "inLanguage": "he-IL",
      "publisher": {
        "@type": "Organization",
        "name": "YZ News",
        "logo": { "@type": "ImageObject", "url": `${siteUrl}/favicon.ico` }
      }
    });

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>YZ News - חדשות, טכנולוגיה וכלכלה</title>
  <meta name="description" content="YZ News - פורטל החדשות המוביל בישראל. חדשות חמות מעולם הטכנולוגיה, הכלכלה, שוק ההון והפוליטיקה." />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="googlebot" content="index, follow" />
  <link rel="canonical" href="${siteUrl}/" />
  <link rel="alternate" hreflang="he" href="${siteUrl}/" />

  <meta property="og:title" content="YZ News - חדשות, טכנולוגיה וכלכלה" />
  <meta property="og:description" content="פורטל החדשות המוביל בישראל" />
  <meta property="og:url" content="${siteUrl}/" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="YZ News" />
  <meta property="og:locale" content="he_IL" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="YZ News - חדשות, טכנולוגיה וכלכלה" />
  <meta name="twitter:description" content="פורטל החדשות המוביל בישראל" />

  <script type="application/ld+json">${jsonLd}</script>

  <meta http-equiv="refresh" content="0;url=${siteUrl}/" />
</head>
<body>
  <header>
    <h1>YZ News - חדשות, טכנולוגיה וכלכלה</h1>
    <nav aria-label="קטגוריות">${categoryLinksHtml}</nav>
  </header>
  <main>
    <h2>כתבות אחרונות</h2>
    ${articleListHtml}
  </main>
  <footer>
    <p>&copy; YZ News</p>
    <nav>
      <a href="${siteUrl}/about">אודות</a> |
      <a href="${siteUrl}/privacy">מדיניות פרטיות</a> |
      <a href="${siteUrl}/terms">תנאי שימוש</a> |
      <a href="${siteUrl}/accessibility">נגישות</a>
    </nav>
  </footer>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=1800, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
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
