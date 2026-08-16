// Post-processing that turns the Vite output into something GitHub Pages serves
// correctly. Runs after `vite build`.
//
//   1. _shell.html -> 404.html   (Pages' fallback boots the SPA router, so deep
//      links to routes that were not prerendered still work)
//   2. news-sitemap.xml          (robots.txt advertises it; Google News only
//      accepts the last 48h, so it cannot be the main sitemap)
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT_DIR = process.env["PAGES_OUT_DIR"] ?? "dist/client";
const SITE_URL = process.env["SITE_URL"] ?? "https://yznews.store";
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

// ---------- 1. SPA fallback ----------

const index = join(OUT_DIR, "index.html");
if (!existsSync(index)) {
  throw new Error(
    `postbuild: ${index} is missing — the homepage was not prerendered.`,
  );
}

// GitHub Pages has no rewrite rules: any path without a matching file is served
// as 404.html. Handing it the prerendered homepage means the router boots and
// takes over client-side, so /admin and any not-yet-prerendered article still
// resolve instead of showing Pages' own 404.
await copyFile(index, join(OUT_DIR, "404.html"));
console.log("[postbuild] index.html -> 404.html");

// ---------- 2. Google News sitemap ----------

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

type ArticleRow = { slug: string | null; id: string; title: string; date: string };

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "postbuild: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are required.",
  );
}

const since = new Date(Date.now() - NEWS_WINDOW_MS).toISOString();
const response = await fetch(
  `${supabaseUrl}/rest/v1/articles?select=slug,id,title,date&is_draft=eq.false&date=gte.${since}&order=date.desc&limit=1000`,
  { headers: { apikey: supabaseKey, Accept: "application/json" } },
);
if (!response.ok) {
  throw new Error(`postbuild: articles query failed ${response.status} ${await response.text()}`);
}
const articles = (await response.json()) as ArticleRow[];

const entries = articles
  .map((article) => {
    const loc = `${SITE_URL}/article/${encodeURIComponent(article.slug || article.id)}`;
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>YZ News</news:name>
        <news:language>he</news:language>
      </news:publication>
      <news:publication_date>${new Date(article.date).toISOString()}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`;
  })
  .join("\n");

const target = join(OUT_DIR, "news-sitemap.xml");
await mkdir(dirname(target), { recursive: true });
await writeFile(
  target,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>
`,
  "utf8",
);
console.log(`[postbuild] news-sitemap.xml — ${articles.length} articles from the last 48h`);
