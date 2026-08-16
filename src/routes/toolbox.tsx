import { createFileRoute } from "@tanstack/react-router";
import Toolbox from "@/pages/Toolbox";

export const Route = createFileRoute("/toolbox")({
  head: () => ({
    meta: [
      { title: "ארגז הכלים - YZ News" },
      { name: "description", content: "כלים, שירותים והטבות מומלצים מבית YZ News" },
      { property: "og:title", content: "ארגז הכלים - YZ News" },
      { property: "og:description", content: "כלים, שירותים והטבות מומלצים מבית YZ News" },
    ],
  }),
  component: Toolbox,
});
