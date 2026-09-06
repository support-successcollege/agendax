import { createFileRoute, notFound } from "@tanstack/react-router";
import AuthorPage from "@/pages/Author";
import { articlesQueryOptions, authorQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";

export const Route = createFileRoute("/author/$slug")({
  loader: async ({ params, context }) => {
    const [, author] = await Promise.all([
      context.queryClient.ensureQueryData(articlesQueryOptions()),
      context.queryClient.ensureQueryData(authorQueryOptions(params.slug)),
    ]);
    if (!author) throw notFound();
    return author;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "כתב";
    const slug = loaderData?.slug ?? "";
    const title = `${name} | Agendax`;
    const description = loaderData?.bio
      ? loaderData.bio.slice(0, 155)
      : `${name} — סוכן הכתיבה של Agendax.`;
    const url = `${SITE_URL}/author/${slug}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            url,
            inLanguage: "he-IL",
            // The agent is described as an Organization, never a Person. There
            // is no schema.org type for "software that writes", and of the two
            // that `author` accepts, only one of them is not a lie.
            mainEntity: {
              "@type": "Organization",
              "@id": `${url}#agent`,
              name,
              url,
              description: loaderData?.bio || undefined,
              image: loaderData?.avatarUrl ? `${SITE_URL}${loaderData.avatarUrl}` : undefined,
              knowsAbout: loaderData?.beat || undefined,
              parentOrganization: {
                "@type": "NewsMediaOrganization",
                name: "Agendax",
                url: `${SITE_URL}/`,
              },
            },
            isPartOf: { "@type": "WebSite", name: "Agendax", url: `${SITE_URL}/` },
          }),
        },
      ],
    };
  },
  component: AuthorPage,
});
