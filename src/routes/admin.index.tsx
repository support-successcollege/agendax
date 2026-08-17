import { createFileRoute } from "@tanstack/react-router";
import Admin from "@/pages/Admin";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "ניהול - Agendax" },
      { name: "description", content: "מסך הניהול של Agendax" },
      { property: "og:title", content: "ניהול - Agendax" },
      { property: "og:description", content: "מסך הניהול של Agendax" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});
