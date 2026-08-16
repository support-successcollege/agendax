import { createFileRoute } from "@tanstack/react-router";
import Courses from "@/pages/Courses";
import { coursesQueryOptions } from "@/lib/queries";

const SITE_URL = "https://yznews.store";
const TITLE = "קורסים והרצאות - YZ News";
const DESC = "קורסים, הרצאות ואירועים קרובים מבית YZ News";

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
