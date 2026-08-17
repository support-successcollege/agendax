import { createFileRoute } from "@tanstack/react-router";
import AdminCourseBuilder from "@/pages/AdminCourseBuilder";

export const Route = createFileRoute("/admin/courses/$id/builder")({
  head: () => ({
    meta: [
      { title: "בניית קורס - Agendax" },
      { name: "description", content: "עורך הקורסים של Agendax" },
      { property: "og:title", content: "בניית קורס - Agendax" },
      { property: "og:description", content: "עורך הקורסים של Agendax" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCourseBuilder,
});
