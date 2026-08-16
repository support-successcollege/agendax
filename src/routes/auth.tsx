import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "התחברות - YZ News" },
      { name: "description", content: "התחברות למערכת הניהול של YZ News" },
      { property: "og:title", content: "התחברות - YZ News" },
      { property: "og:description", content: "התחברות למערכת הניהול של YZ News" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Auth,
});
