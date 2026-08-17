import { createFileRoute } from "@tanstack/react-router";
import About from "@/pages/About";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "אודות - Agendax" },
      { name: "description", content: "אודות Agendax - פורטל החדשות המוביל לטכנולוגיה, כלכלה ושוק ההון" },
      { property: "og:title", content: "אודות - Agendax" },
      { property: "og:description", content: "אודות Agendax - פורטל החדשות המוביל לטכנולוגיה, כלכלה ושוק ההון" },
    ],
  }),
  component: About,
});
