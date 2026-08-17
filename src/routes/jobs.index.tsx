import { createFileRoute } from "@tanstack/react-router";
import Jobs from "@/pages/Jobs";
import { jobsQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "אזור התעסוקה - Agendax";
const DESC =
  "משרות בהייטק, ב-AI ובפיננסים - אזור התעסוקה של Agendax";

export const Route = createFileRoute("/jobs/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(jobsQueryOptions(true));
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${SITE_URL}/jobs` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/jobs` }],
  }),
  component: Jobs,
});
