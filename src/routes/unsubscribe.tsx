import { createFileRoute } from "@tanstack/react-router";
import Unsubscribe from "@/pages/Unsubscribe";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "הסרה מרשימת התפוצה - Agendax" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Unsubscribe,
});
