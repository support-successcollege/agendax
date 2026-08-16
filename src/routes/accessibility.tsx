import { createFileRoute } from "@tanstack/react-router";
import Accessibility from "@/pages/Accessibility";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "הצהרת נגישות - YZ News" },
      { name: "description", content: "הצהרת הנגישות של אתר YZ News בהתאם לתקן הישראלי" },
      { property: "og:title", content: "הצהרת נגישות - YZ News" },
      { property: "og:description", content: "הצהרת הנגישות של אתר YZ News בהתאם לתקן הישראלי" },
    ],
  }),
  component: Accessibility,
});
