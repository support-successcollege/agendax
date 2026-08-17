// Build-time enumeration of the dynamic routes to prerender.
//
// There is no server on GitHub Pages, so /article/<slug> only exists if a real
// HTML file was written for it during the build. This queries Supabase over
// PostgREST (anon key, same rows the public site can already read) and hands
// TanStack Start the full page list.

type PageEntry = {
  path: string;
  sitemap?: {
    priority?: number;
    changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    lastmod?: string;
    news?: { publication: { name: string; language: string }; publicationDate: string; title: string };
  };
};

const STATIC_PAGES: PageEntry[] = [
  { path: "/", sitemap: { priority: 1.0, changefreq: "hourly" } },
  { path: "/about", sitemap: { priority: 0.5, changefreq: "monthly" } },
  { path: "/jobs", sitemap: { priority: 0.7, changefreq: "daily" } },
  { path: "/toolbox", sitemap: { priority: 0.6, changefreq: "weekly" } },
  { path: "/courses", sitemap: { priority: 0.7, changefreq: "weekly" } },
  { path: "/privacy", sitemap: { priority: 0.3, changefreq: "yearly" } },
  { path: "/terms", sitemap: { priority: 0.3, changefreq: "yearly" } },
  { path: "/accessibility", sitemap: { priority: 0.3, changefreq: "yearly" } },
];

// Google News only indexes the last 48h, so older articles are prerendered for
// the regular sitemap but deliberately carry no <news:news> block.
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

async function selectRows<T>(
  env: Record<string, string>,
  table: string,
  query: string,
): Promise<T[]> {
  const url = env["VITE_SUPABASE_URL"];
  const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error(
      "collect-pages: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are required to enumerate prerender routes.",
    );
  }

  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `collect-pages: ${table} query failed with ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T[];
}

export async function collectPrerenderPages(
  env: Record<string, string>,
): Promise<PageEntry[]> {
  const [articles, courses, events, jobs] = await Promise.all([
    selectRows<{ slug: string | null; id: string; date: string; title: string }>(
      env,
      "articles",
      "select=slug,id,date,title&is_draft=eq.false&order=date.desc&limit=5000",
    ),
    selectRows<{ slug: string }>(
      env,
      "courses",
      "select=slug&is_published=eq.true&limit=500",
    ),
    selectRows<{ slug: string }>(env, "events", "select=slug&limit=500"),
    selectRows<{ id: string }>(env, "jobs", "select=id&is_active=eq.true&limit=1000"),
  ]);

  const now = Date.now();

  const articlePages: PageEntry[] = articles.map((article) => {
    const publishedAt = new Date(article.date);
    const isFresh = now - publishedAt.getTime() < NEWS_WINDOW_MS;
    return {
      // The slug is used raw: TanStack encodes it when requesting the page, and
      // Pages serves the Hebrew directory name back correctly.
      path: `/article/${article.slug || article.id}`,
      sitemap: {
        priority: isFresh ? 0.9 : 0.6,
        changefreq: isFresh ? "hourly" : "monthly",
        lastmod: publishedAt.toISOString(),
        ...(isFresh && {
          news: {
            publication: { name: "Agendax", language: "he" },
            publicationDate: publishedAt.toISOString(),
            title: article.title,
          },
        }),
      },
    };
  });

  const pages: PageEntry[] = [
    ...STATIC_PAGES,
    ...articlePages,
    ...courses.map((course) => ({
      path: `/courses/${course.slug}`,
      sitemap: { priority: 0.8, changefreq: "weekly" as const },
    })),
    ...events.map((event) => ({
      path: `/events/${event.slug}`,
      sitemap: { priority: 0.6, changefreq: "weekly" as const },
    })),
    ...jobs.map((job) => ({
      path: `/jobs/${job.id}`,
      sitemap: { priority: 0.6, changefreq: "daily" as const },
    })),
  ];

  console.log(
    `[collect-pages] ${pages.length} routes (${articlePages.length} articles, ` +
      `${courses.length} courses, ${events.length} events, ${jobs.length} jobs)`,
  );
  return pages;
}
