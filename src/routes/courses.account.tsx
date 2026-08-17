import { createFileRoute } from "@tanstack/react-router";
import CoursesAccount from "@/pages/CoursesAccount";

export const Route = createFileRoute("/courses/account")({
  head: () => ({
    meta: [
      { title: "האזור האישי - קורסים - Agendax" },
      { name: "description", content: "האזור האישי לתלמידי הקורסים של Agendax" },
      { property: "og:title", content: "האזור האישי - קורסים - Agendax" },
      { property: "og:description", content: "האזור האישי לתלמידי הקורסים של Agendax" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoursesAccount,
});
