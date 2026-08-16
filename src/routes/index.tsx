import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";
import { articlesQueryOptions, categoriesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://yznews.store";
const TITLE = "YZ NEWS | חדשות משוקי ההון , מניות, וול סטריט ודוחות כספיים";
const DESC =
  "העדכונים החמים ביותר משוקי הההון, ניתוח מניות מובילות, אירועי מאקרו-כלכלה בארה\"ב ודיווחים שוטפים מהבורסות האמריקאיות. כל הדיווחים שחשובים למשקיעים במקום אחד.";
const SOCIAL_IMAGE =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/1PaTcUnJQyWhm7SOLQvBN3lUgPm2/social-images/social-1775731097302-לוגו_ניוז.webp";

export const Route = createFileRoute("/")({
  // Prime the article list on the server so crawlers receive real content.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(articlesQueryOptions()),
      context.queryClient.ensureQueryData(categoriesQueryOptions()),
    ]);
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: SOCIAL_IMAGE },
      { name: "twitter:image", content: SOCIAL_IMAGE },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "YZ News",
          url: `${SITE_URL}/`,
          inLanguage: "he-IL",
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}/?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "YZ News",
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/favicon.png`,
          sameAs: [
            "https://www.instagram.com/yznews",
            "https://www.facebook.com/yznews",
          ],
        }),
      },
    ],
  }),
  component: Index,
});
