import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/Privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "מדיניות פרטיות - YZ News" },
      { name: "description", content: "מדיניות הפרטיות של אתר YZ News" },
      { property: "og:title", content: "מדיניות פרטיות - YZ News" },
      { property: "og:description", content: "מדיניות הפרטיות של אתר YZ News" },
    ],
  }),
  component: Privacy,
});
