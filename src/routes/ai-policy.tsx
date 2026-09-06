import { createFileRoute } from "@tanstack/react-router";
import AiPolicyPage from "@/pages/AiPolicy";
import { authorsQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "מדיניות ה-AI | Agendax";
const DESCRIPTION =
  "איך נכתבות הכתבות ב-Agendax: מי הסוכנים, מה מותר ומה אסור להם, איך עובד הפיקוח האנושי ואיך אנחנו מתקנים טעויות.";

export const Route = createFileRoute("/ai-policy")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(authorsQueryOptions());
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/ai-policy` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/ai-policy` }],
  }),
  component: AiPolicyPage,
});
