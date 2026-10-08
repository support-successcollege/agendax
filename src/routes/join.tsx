import { createFileRoute } from "@tanstack/react-router";
import JoinPage from "@/pages/Join";
import { articlesQueryOptions, categoriesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "הצטרפו ל-Agendax | ערוץ וואטסאפ וניוזלטר";
const DESCRIPTION =
  "קבלו את חדשות הטכנולוגיה, ה-AI והכסף של ישראל — בערוץ וואטסאפ שמעדכן במהלך היום או בניוזלטר יומי למייל.";

export const Route = createFileRoute("/join")({
  loader: async ({ context }) => {
    // The page argues with real headlines — the message preview and the list of
    // what went out — so they belong in the prerendered HTML, not in a flash
    // after hydration.
    await Promise.all([
      context.queryClient.ensureQueryData(categoriesQueryOptions()),
      context.queryClient.ensureQueryData(articlesQueryOptions()),
    ]);
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/join` },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/join` }],
  }),
  component: JoinPage,
});
