import { createFileRoute, redirect } from "@tanstack/react-router";
import Article from "@/pages/Article";
import {
  articleQueryOptions,
  articlesQueryOptions,
  categoriesQueryOptions,
  isUuid,
} from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const FALLBACK_TITLE = "כתבה - Agendax";
const FALLBACK_DESC = "קריאת כתבה מלאה בפורטל החדשות Agendax";

export const Route = createFileRoute("/article/$id")({
  // Fetch the full article on the server so both the crawler and the reader
  // get the article body in the initial HTML.
  loader: async ({ params, context }) => {
    const [article] = await Promise.all([
      context.queryClient.ensureQueryData(articleQueryOptions(params.id)),
      context.queryClient.ensureQueryData(articlesQueryOptions()),
      context.queryClient.ensureQueryData(categoriesQueryOptions()),
    ]);

    // Legacy /article/<uuid> links permanently redirect to the slug URL so
    // Google consolidates ranking on the readable Hebrew address.
    if (article?.slug && isUuid(decodeURIComponent(params.id))) {
      throw redirect({
        to: "/article/$id",
        params: { id: article.slug },
        statusCode: 301,
      });
    }

    const meta = article && !article.isDraft ? article : null;
    return {
      meta: meta
        ? {
            id: meta.slug || meta.id,
            title: meta.title,
            excerpt: meta.excerpt,
            image_url: meta.imageUrl,
            date: meta.date,
            author: meta.author,
            category: meta.category,
          }
        : null,
    };
  },
  head: ({ loaderData, params }) => {
    const article = loaderData?.meta;
    const title = article ? `${article.title} | Agendax` : FALLBACK_TITLE;
    const description = article?.excerpt?.slice(0, 155) || FALLBACK_DESC;
    const image = article?.image_url;
    const url = `${SITE_URL}/article/${encodeURIComponent(article?.id ?? decodeURIComponent(params.id))}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        {
          name: "robots",
          content: article
            ? "index, follow, max-image-preview:large, max-snippet:-1"
            : "noindex",
        },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image && image.startsWith("https://")
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: article
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "NewsArticle",
                headline: article.title,
                description: article.excerpt,
                image: article.image_url ? [article.image_url] : undefined,
                datePublished: article.date,
                dateModified: article.date,
                author: { "@type": "Person", name: article.author },
                publisher: {
                  "@type": "Organization",
                  name: "Agendax",
                  logo: {
                    "@type": "ImageObject",
                    url: `${SITE_URL}/favicon.png`,
                  },
                },
                mainEntityOfPage: { "@type": "WebPage", "@id": url },
                articleSection: article.category,
                inLanguage: "he-IL",
              }),
            },
          ]
        : [],
    };
  },
  component: Article,
});
