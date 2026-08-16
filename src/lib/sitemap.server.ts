const SITE_URL = "https://yznews.store";

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const STATIC_PAGES = [
  { loc: "/", priority: "1.0", changefreq: "hourly" },
  { loc: "/about", priority: "0.5", changefreq: "monthly" },
  { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
  { loc: "/terms", priority: "0.3", changefreq: "yearly" },
  { loc: "/accessibility", priority: "0.3", changefreq: "yearly" },
];

export const xmlResponse = (body: string, maxAge: number) =>
  new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });

export const sitemapErrorResponse = (label: string, err: unknown) => {
  console.error(`${label} generation failed:`, err);
  return new Response("Error generating sitemap", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

/** Main sitemap: static pages + every published article. */
export async function buildSitemapXml(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: articles, error } = await supabaseAdmin
    .from("articles")
    .select("id, slug, date, updated_at")
    .eq("is_draft", false)
    .order("date", { ascending: false });

  if (error) throw error;

  const urls = [
    ...STATIC_PAGES.map(
      (page) => `  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <xhtml:link rel="alternate" hreflang="he" href="${SITE_URL}${page.loc}" />
  </url>`,
    ),
    ...(articles ?? []).map((article) => {
      const loc = `${SITE_URL}/article/${escapeXml(encodeURIComponent(article.slug || article.id))}`;
      // lastmod comes from the article's own updated_at (falling back to its
      // publication date) — never from build or request time.
      const lastmod = new Date(article.updated_at || article.date).toISOString();
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="he" href="${loc}" />
  </url>`;
    }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;
}

/**
 * Google News sitemap: articles actually published in the last 2 days.
 * Uses published_at (falling back to created_at) — the `date` field is an
 * editorial date and can be far older than the real publication moment.
 */
export async function buildNewsSitemapXml(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: articles, error } = await supabaseAdmin
    .from("articles")
    .select("id, slug, title, date, published_at, created_at")
    .eq("is_draft", false)
    .or(
      `published_at.gte.${cutoff},and(published_at.is.null,created_at.gte.${cutoff})`,
    )
    .limit(1000);

  if (error) throw error;

  const entries = (articles ?? [])
    .map((article) => ({
      id: article.slug || article.id,
      title: article.title,
      publishedAt: new Date(
        article.published_at || article.created_at || article.date,
      ),
    }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${SITE_URL}/article/${escapeXml(encodeURIComponent(entry.id))}</loc>
    <news:news>
      <news:publication>
        <news:name>YZ News</news:name>
        <news:language>he</news:language>
      </news:publication>
      <news:publication_date>${entry.publishedAt.toISOString()}</news:publication_date>
      <news:title>${escapeXml(entry.title)}</news:title>
    </news:news>
  </url>`,
  )
  .join("\n")}
</urlset>`;
}
