import { createFileRoute } from "@tanstack/react-router";
import CoursesAccount from "@/pages/CoursesAccount";

export const Route = createFileRoute("/courses/account")({
  head: () => ({
    meta: [
      { title: "האזור האישי - קורסים - YZ News" },
      { name: "description", content: "האזור האישי לתלמידי הקורסים של YZ News" },
      { property: "og:title", content: "האזור האישי - קורסים - YZ News" },
      { property: "og:description", content: "האזור האישי לתלמידי הקורסים של YZ News" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoursesAccount,
});
