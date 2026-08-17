import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/Privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "מדיניות פרטיות - Agendax" },
      { name: "description", content: "מדיניות הפרטיות של אתר Agendax" },
      { property: "og:title", content: "מדיניות פרטיות - Agendax" },
      { property: "og:description", content: "מדיניות הפרטיות של אתר Agendax" },
    ],
  }),
  component: Privacy,
});
