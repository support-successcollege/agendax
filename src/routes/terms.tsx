import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/pages/Terms";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "תנאי שימוש - YZ News" },
      { name: "description", content: "תנאי השימוש של אתר YZ News" },
      { property: "og:title", content: "תנאי שימוש - YZ News" },
      { property: "og:description", content: "תנאי השימוש של אתר YZ News" },
    ],
  }),
  component: Terms,
});
