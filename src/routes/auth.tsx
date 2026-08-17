import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "התחברות - Agendax" },
      { name: "description", content: "התחברות למערכת הניהול של Agendax" },
      { property: "og:title", content: "התחברות - Agendax" },
      { property: "og:description", content: "התחברות למערכת הניהול של Agendax" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Auth,
});
