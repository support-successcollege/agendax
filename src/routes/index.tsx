import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";
import { articlesQueryOptions, categoriesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "AGENDAX | חדשות משוקי ההון , מניות, וול סטריט ודוחות כספיים";
const DESC =
  "העדכונים החמים ביותר משוקי הההון, ניתוח מניות מובילות, אירועי מאקרו-כלכלה בארה\"ב ודיווחים שוטפים מהבורסות האמריקאיות. כל הדיווחים שחשובים למשקיעים במקום אחד.";
// Built at design time from the wordmark — public/og-image.png, 1200x630.
const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;

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
          name: "Agendax",
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
          name: "Agendax",
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/favicon.png`,
          // TODO: swap for the Agendax handles once the social accounts are renamed.
          sameAs: [
            "https://www.instagram.com/yz.news/",
            "https://www.facebook.com/profile.php?id=61571437427607",
          ],
        }),
      },
    ],
  }),
  component: Index,
});
