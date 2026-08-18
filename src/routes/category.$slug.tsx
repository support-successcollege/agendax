import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import CategoryPage from "@/pages/CategoryPage";
import { articlesQueryOptions, categoriesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";

export const Route = createFileRoute("/category/$slug")({
  loader: async ({ params, context }) => {
    // "home" is the homepage, not a category page — one canonical URL for it.
    if (params.slug === "home") {
      throw redirect({ to: "/", statusCode: 301 });
    }

    const [, categories] = await Promise.all([
      context.queryClient.ensureQueryData(articlesQueryOptions()),
      context.queryClient.ensureQueryData(categoriesQueryOptions()),
    ]);

    const category = categories.find(
      (c) => c.slug === params.slug && c.isActive,
    );
    if (!category) throw notFound();

    return { name: category.name, slug: category.slug };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "קטגוריה";
    const slug = loaderData?.slug ?? "";
    const title = `${name} | Agendax`;
    const description = `כל הכתבות בנושא ${name} — סיקור שוטף בעברית מבית Agendax.`;
    const url = `${SITE_URL}/category/${encodeURIComponent(slug)}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
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
            "@type": "CollectionPage",
            name,
            url,
            inLanguage: "he-IL",
            isPartOf: { "@type": "WebSite", name: "Agendax", url: `${SITE_URL}/` },
          }),
        },
      ],
    };
  },
  component: CategoryPage,
});
