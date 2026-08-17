import { createFileRoute } from "@tanstack/react-router";
import Toolbox from "@/pages/Toolbox";

export const Route = createFileRoute("/toolbox")({
  head: () => ({
    meta: [
      { title: "ארגז הכלים - Agendax" },
      { name: "description", content: "כלים, שירותים והטבות מומלצים מבית Agendax" },
      { property: "og:title", content: "ארגז הכלים - Agendax" },
      { property: "og:description", content: "כלים, שירותים והטבות מומלצים מבית Agendax" },
    ],
  }),
  component: Toolbox,
});
