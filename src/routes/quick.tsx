import { createFileRoute } from "@tanstack/react-router";
import QuickProduction from "@/pages/QuickProduction";

// Admin-only and client-only, like /admin: it is kept out of the prerender
// (vite.config.ts) and out of the sitemap (scripts/postbuild.ts).
export const Route = createFileRoute("/quick")({
  head: () => ({
    meta: [
      { title: "הפקה מהירה - Agendax" },
      { name: "description", content: "הפקה מהירה של ידיעה חמה" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuickProduction,
});
