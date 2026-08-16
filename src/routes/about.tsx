import { createFileRoute } from "@tanstack/react-router";
import About from "@/pages/About";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "אודות - YZ News" },
      { name: "description", content: "אודות YZ News - פורטל החדשות המוביל לטכנולוגיה, כלכלה ושוק ההון" },
      { property: "og:title", content: "אודות - YZ News" },
      { property: "og:description", content: "אודות YZ News - פורטל החדשות המוביל לטכנולוגיה, כלכלה ושוק ההון" },
    ],
  }),
  component: About,
});
