import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/pages/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "איפוס סיסמה - Agendax" },
      { name: "description", content: "איפוס סיסמה לחשבון Agendax" },
      { property: "og:title", content: "איפוס סיסמה - Agendax" },
      { property: "og:description", content: "איפוס סיסמה לחשבון Agendax" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});
