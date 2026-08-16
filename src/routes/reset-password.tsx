import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/pages/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "איפוס סיסמה - YZ News" },
      { name: "description", content: "איפוס סיסמה לחשבון YZ News" },
      { property: "og:title", content: "איפוס סיסמה - YZ News" },
      { property: "og:description", content: "איפוס סיסמה לחשבון YZ News" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});
