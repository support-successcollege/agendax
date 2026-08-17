import { createFileRoute } from "@tanstack/react-router";
import Accessibility from "@/pages/Accessibility";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "הצהרת נגישות - Agendax" },
      { name: "description", content: "הצהרת הנגישות של אתר Agendax בהתאם לתקן הישראלי" },
      { property: "og:title", content: "הצהרת נגישות - Agendax" },
      { property: "og:description", content: "הצהרת הנגישות של אתר Agendax בהתאם לתקן הישראלי" },
    ],
  }),
  component: Accessibility,
});
