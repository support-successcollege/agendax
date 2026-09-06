import { createFileRoute, redirect } from "@tanstack/react-router";
import Article from "@/pages/Article";
import { imageVariants } from "@/lib/imageUtils";
import {
  articleQueryOptions,
  articlesQueryOptions,
  categoriesQueryOptions,
  isUuid,
} from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const FALLBACK_TITLE = "כתבה - Agendax";
const FALLBACK_DESC = "קריאת כתבה מלאה ב-Agendax — הייטק, AI, כספים וחברות";

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
            publishedAt: meta.publishedAt ?? null,
            updatedAt: meta.updatedAt ?? null,
            categorySlug: meta.categorySlug,
            author: meta.author,
            authorSlug: meta.authorSlug ?? null,
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
    // Published and modified are different facts. Saying they are the same
    // tells Google a rolling story never moved.
    const publishedIso = article ? new Date(article.publishedAt || article.date).toISOString() : "";
    const modifiedIso = article
      ? new Date(article.updatedAt || article.publishedAt || article.date).toISOString()
      : "";
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
        { property: "og:site_name", content: "Agendax" },
        ...(article
          ? [
              { property: "article:published_time", content: publishedIso },
              { property: "article:modified_time", content: modifiedIso },
              { property: "article:section", content: article.category },
              { property: "article:author", content: article.author },
            ]
          : []),
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
                // Google asks for the same picture at several aspect ratios;
                // the transform endpoint crops them on demand from the one file.
                image: article.image_url ? imageVariants(article.image_url) : undefined,
                datePublished: publishedIso,
                dateModified: modifiedIso,
// The author is a declared AI agent, so it is an Organization with a
                // page that says exactly that. `Person` is the other type
                // `author` accepts and it would be a false claim on every one of
                // these stories. The name matches the visible byline, and the
                // @id resolves to the profile.
                author: article.authorSlug
                  ? {
                      "@type": "Organization",
                      "@id": `${SITE_URL}/author/${article.authorSlug}#agent`,
                      name: article.author,
                      url: `${SITE_URL}/author/${article.authorSlug}`,
                    }
                  : {
                      "@type": "Organization",
                      "@id": `${SITE_URL}/newsroom#newsroom`,
                      name: article.author,
                      url: `${SITE_URL}/newsroom`,
                    },
                publisher: {
                  "@type": "NewsMediaOrganization",
                  name: "Agendax",
                  url: SITE_URL,
                  logo: {
                    "@type": "ImageObject",
                    url: `${SITE_URL}/favicon.png`,
                    width: 512,
                    height: 512,
                  },
                },
                mainEntityOfPage: { "@type": "WebPage", "@id": url },
                articleSection: article.category,
                inLanguage: "he-IL",
                isAccessibleForFree: true,
              }),
            },
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "@id": `${url}#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "ראשי", item: `${SITE_URL}/` },
                  ...(article.categorySlug
                    ? [{
                        "@type": "ListItem",
                        position: 2,
                        name: article.category,
                        item: `${SITE_URL}/category/${encodeURIComponent(article.categorySlug)}`,
                      }]
                    : []),
                  {
                    "@type": "ListItem",
                    position: article.categorySlug ? 3 : 2,
                    name: article.title,
                    item: url,
                  },
                ],
              }),
            },
          ]
        : [],
    };
  },
  component: Article,
});
