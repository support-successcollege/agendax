import { createFileRoute } from "@tanstack/react-router";
import AdminCourseBuilder from "@/pages/AdminCourseBuilder";

export const Route = createFileRoute("/admin/courses/$id/builder")({
  head: () => ({
    meta: [
      { title: "בניית קורס - YZ News" },
      { name: "description", content: "עורך הקורסים של YZ News" },
      { property: "og:title", content: "בניית קורס - YZ News" },
      { property: "og:description", content: "עורך הקורסים של YZ News" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCourseBuilder,
});
