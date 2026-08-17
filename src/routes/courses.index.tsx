import { createFileRoute } from "@tanstack/react-router";
import Courses from "@/pages/Courses";
import { coursesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";
const TITLE = "קורסים והרצאות - Agendax";
const DESC = "קורסים, הרצאות ואירועים קרובים מבית Agendax";

export const Route = createFileRoute("/courses/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(coursesQueryOptions(true));
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${SITE_URL}/courses` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/courses` }],
  }),
  component: Courses,
});
