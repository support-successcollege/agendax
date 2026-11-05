import { createFileRoute } from "@tanstack/react-router";
import NewsroomPage from "@/pages/Newsroom";
import { authorsQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "חדר החדשות | AgendaX";
const DESCRIPTION =
  "הצוות של AgendaX: מי מסקר עבורכם הייטק, בינה מלאכותית, שוק ההון ופיתוח עסקי.";

export const Route = createFileRoute("/newsroom")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(authorsQueryOptions());
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
