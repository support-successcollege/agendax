import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/pages/Terms";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "תנאי שימוש - Agendax" },
      { name: "description", content: "תנאי השימוש של אתר Agendax" },
      { property: "og:title", content: "תנאי שימוש - Agendax" },
      { property: "og:description", content: "תנאי השימוש של אתר Agendax" },
    ],
  }),
  component: Terms,
});
