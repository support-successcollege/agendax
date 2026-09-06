// Post-processing that turns the Vite output into something GitHub Pages serves
// correctly. Runs after `vite build`.
//
//   1. _shell.html -> 404.html   (Pages' fallback boots the SPA router, so deep
//      links to routes that were not prerendered still work)
//   2. news-sitemap.xml          (robots.txt advertises it; Google News only
//      accepts the last 48h, so it cannot be the main sitemap)
//   3. sitemap.xml cleanup       (the prerender plugin lists everything it
//      crawled, including routes that must never be submitted)
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT_DIR = process.env["PAGES_OUT_DIR"] ?? "dist/client";
const SITE_URL = process.env["SITE_URL"] ?? "https://agendax.co.il";
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

// ---------- 2. Clean the generated sitemap ----------
//
// The prerender plugin writes sitemap.xml from the routes it crawled, so three
// kinds of entry slip in that Google should never be handed:
//   • /admin/, /auth, /reset-password — client-only, and /admin/ returns 404;
//   • /jobs/ and /courses/ — trailing-slash twins of pages whose canonical
//     carries no slash, so submitting both asks Google to pick a duplicate;
//   • every Hebrew article twice — the crawl finds the percent-encoded href
//     the site links to while the route list supplies the raw slug, and both
//     were submitted. The page's canonical is the encoded form, so that is the
//     one kept;
//   • the build date as lastmod on pages that did not change, which teaches
//     Google to ignore the signal.
const SITEMAP_EXCLUDE = [/^\/admin(\/|$)/, /^\/auth(\/|$)/, /^\/reset-password(\/|$)/];

const sitemapPath = join(OUT_DIR, "sitemap.xml");
if (existsSync(sitemapPath)) {
  const xml = await readFile(sitemapPath, "utf8");
  const blocks = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);

  const seen = new Set<string>();
  const kept: string[] = [];
  let dropped = 0;

  for (const block of blocks) {
    const loc = /<loc>(.*?)<\/loc>/.exec(block)?.[1];
    if (!loc) continue;
    let parsed: URL;
    try {
      parsed = new URL(loc);
    } catch {
      continue;
    }

    // `URL.pathname` percent-encodes, which is exactly the form the page's own
    // canonical uses — so it doubles as the normaliser that collapses the raw
    // Hebrew slug and its encoded twin onto one entry.
    let path = parsed.pathname;
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);

    if (SITEMAP_EXCLUDE.some((re) => re.test(decodeURIComponent(path)))) {
      dropped++;
      continue;
    }
    if (seen.has(path)) {
      dropped++;
      continue;
    }
    seen.add(path);
    // Emit the canonical spelling, not whichever spelling the crawl happened
    // to find first.
    kept.push(block.replace(/<loc>.*?<\/loc>/, `<loc>${parsed.origin}${path}</loc>`));
  }

  await writeFile(
    sitemapPath,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${kept.join("\n")}\n</urlset>\n`,
    "utf8",
  );
  console.log(`[postbuild] sitemap.xml — ${kept.length} urls kept, ${dropped} dropped`);
}

// ---------- 3. Google News sitemap ----------

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

type ArticleRow = { slug: string | null; id: string; title: string; date: string; image_url: string | null };

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "postbuild: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are required.",
  );
}

const since = new Date(Date.now() - NEWS_WINDOW_MS).toISOString();
const response = await fetch(
  `${supabaseUrl}/rest/v1/articles?select=slug,id,title,date,image_url&is_draft=eq.false&date=gte.${since}&order=date.desc&limit=1000`,
  { headers: { apikey: supabaseKey, Accept: "application/json" } },
);
if (!response.ok) {
  throw new Error(`postbuild: articles query failed ${response.status} ${await response.text()}`);
}
const articles = (await response.json()) as ArticleRow[];

const entries = articles
  .map((article) => {
    const loc = `${SITE_URL}/article/${encodeURIComponent(article.slug || article.id)}`;
    // The lead image rides along so Google Images can pick the articles up —
    // the crawler treats sitemap images as first-class discovery.
    const image = article.image_url?.startsWith("https://")
      ? `
    <image:image>
      <image:loc>${escapeXml(article.image_url)}</image:loc>
      <image:title>${escapeXml(article.title)}</image:title>
    </image:image>`
      : "";
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>Agendax</news:name>
        <news:language>he</news:language>
      </news:publication>
      <news:publication_date>${new Date(article.date).toISOString()}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>${image}
  </url>`;
  })
  .join("\n");

const target = join(OUT_DIR, "news-sitemap.xml");
await mkdir(dirname(target), { recursive: true });
await writeFile(
  target,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>
`,
  "utf8",
);
console.log(`[postbuild] news-sitemap.xml — ${articles.length} articles from the last 48h`);
