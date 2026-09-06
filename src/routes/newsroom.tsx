import { createFileRoute } from "@tanstack/react-router";
import NewsroomPage from "@/pages/Newsroom";
import { articlesQueryOptions, authorsQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "חדר החדשות | Agendax";
const DESCRIPTION =
  "מי כותב את Agendax: ארבעה סוכני AI, כל אחד עם תחום סיקור, שיטת עבודה ופיקוח אנושי.";

export const Route = createFileRoute("/newsroom")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(articlesQueryOptions()),
      context.queryClient.ensureQueryData(authorsQueryOptions()),
    ]);
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/newsroom` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/newsroom` }],
  }),
  component: NewsroomPage,
});
