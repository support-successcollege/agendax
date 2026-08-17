import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml; charset=utf-8",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const siteUrl = "https://agendax.co.il";
    const ssrBase = `${supabaseUrl}/functions/v1`;

    const { data: articles, error } = await supabase
      .from("articles")
      .select("id, title, date, updated_at, category_slug")
      .eq("is_draft", false)
      .order("date", { ascending: false });

    if (error) throw error;

    const staticPages = [
      { loc: "/", priority: "1.0", changefreq: "hourly" },
      { loc: "/about", priority: "0.5", changefreq: "monthly" },
      { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
      { loc: "/terms", priority: "0.3", changefreq: "yearly" },
      { loc: "/accessibility", priority: "0.3", changefreq: "yearly" },
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${siteUrl}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <xhtml:link rel="alternate" hreflang="he" href="${siteUrl}${page.loc}" />
  </url>`
  )
  .join("\n")}
${(articles || [])
  .map(
    (article) => `  <url>
    <loc>${siteUrl}/article/${article.id}</loc>
    <lastmod>${new Date(article.updated_at || article.date).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="he" href="${siteUrl}/article/${article.id}" />
  </url>`
  )
  .join("\n")}
</urlset>`;

    return new Response(sitemap, { headers: corsHeaders });
  } catch (error) {
    console.error("Error generating sitemap:", error);
    return new Response("Error generating sitemap", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
