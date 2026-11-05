import { createFileRoute, notFound } from "@tanstack/react-router";
import AuthorPage from "@/pages/Author";
import { authorArticlesQueryOptions, authorQueryOptions } from "@/lib/queries";
import { authorEntity, authorUrl } from "@/lib/authorSchema";

const SITE_URL = "https://agendax.co.il";

const pageOf = (value: unknown) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 1 ? n : 1;
};

export const Route = createFileRoute("/author/$slug")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = pageOf(search.page);
    return page > 1 ? { page } : {};
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, context, deps }) => {
    const [author, listing] = await Promise.all([
      context.queryClient.ensureQueryData(authorQueryOptions(params.slug)),
      context.queryClient.ensureQueryData(
        authorArticlesQueryOptions(params.slug, deps.page),
      ),
    ]);
    if (!author) throw notFound();
    return { author, total: listing.total, page: deps.page };
  },
  head: ({ loaderData }) => {
    const author = loaderData?.author;
    const name = author?.name ?? "כתב";
    const slug = author?.slug ?? "";
    const page = loaderData?.page ?? 1;
    const total = loaderData?.total ?? 0;
    const title =
      page > 1 ? `${name} - עמוד ${page} | Agendax` : `${name} | Agendax`;
    const description = author?.bio
      ? author.bio.slice(0, 155)
      : `${name} - כתב ב-Agendax.`;
    const base = authorUrl(slug);
    // Self-canonical: every page of the listing is its own page.
    const url = page > 1 ? `${base}?page=${page}` : base;
    // A profile with nothing published is a thin page: reachable, not indexed.
    const robots =
      total > 0
        ? "index, follow, max-image-preview:large, max-snippet:-1"
        : "noindex, follow";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: robots },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: author
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "ProfilePage",
                url,
                inLanguage: "he-IL",
                mainEntity: {
                  ...authorEntity(author),
                  description: author.bio || undefined,
                  ...(author.kind === "human"
                    ? {
                        jobTitle: author.role || undefined,
                        worksFor: {
                          "@type": "NewsMediaOrganization",
                          name: "Agendax",
                          url: `${SITE_URL}/`,
                        },
                      }
                    : {
                        knowsAbout: author.beat || undefined,
                        parentOrganization: {
                          "@type": "NewsMediaOrganization",
                          name: "Agendax",
                          url: `${SITE_URL}/`,
                        },
                      }),
                },
                isPartOf: {
                  "@type": "WebSite",
                  name: "Agendax",
                  url: `${SITE_URL}/`,
                },
              }),
            },
          ]
        : [],
    };
  },
  component: AuthorPage,
});
