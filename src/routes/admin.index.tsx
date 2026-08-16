import { createFileRoute } from "@tanstack/react-router";
import Admin from "@/pages/Admin";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "ניהול - YZ News" },
      { name: "description", content: "מסך הניהול של YZ News" },
      { property: "og:title", content: "ניהול - YZ News" },
      { property: "og:description", content: "מסך הניהול של YZ News" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});
