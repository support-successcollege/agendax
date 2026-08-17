import { createFileRoute } from "@tanstack/react-router";
import About from "@/pages/About";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "אודות - Agendax" },
      { name: "description", content: "אודות Agendax — סדר היום של הטכנולוגיה, ה-AI והעסקים" },
      { property: "og:title", content: "אודות - Agendax" },
      { property: "og:description", content: "אודות Agendax — סדר היום של הטכנולוגיה, ה-AI והעסקים" },
    ],
  }),
  component: About,
});
