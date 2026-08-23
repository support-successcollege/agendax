import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";
import { articlesQueryOptions, categoriesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "Agendax | הייטק, AI, כספים וחברות";
const DESC =
  "סדר היום של עולם החדשנות — הייטק, בינה מלאכותית, שוקי ההון והחברות שמזיזות אותם. סיקור שוטף בעברית, עם ההקשר שצריך כדי להבין למה זה משנה.";
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
          "@type": "NewsMediaOrganization",
          name: "Agendax",
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/favicon.png`,
          // The Facebook link points at the real Page (the profile.php id was
          // a personal profile, unusable for the brand entity).
          sameAs: [
            "https://www.linkedin.com/in/agendax-80012a42b",
            "https://www.instagram.com/agendax.co.il",
            "https://www.facebook.com/1173078022564816",
            "https://x.com/agendaxcoil",
          ],
        }),
      },
    ],
  }),
  component: Index,
});
