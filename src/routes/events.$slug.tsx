import { createFileRoute } from "@tanstack/react-router";
import EventLanding from "@/pages/EventLanding";
import { eventQueryOptions } from "@/lib/queries";

const SITE_URL = "https://agendax.co.il";

export const Route = createFileRoute("/events/$slug")({
  loader: async ({ params, context }) => {
    const event = await context.queryClient.ensureQueryData(
      eventQueryOptions(params.slug),
    );
    return {
      event:
        event && event.is_published
          ? {
              title: event.title,
              description: event.description || "",
              image: event.cover_image_url,
              date: event.event_date,
              location: event.location,
            }
          : null,
    };
  },
  head: ({ loaderData, params }) => {
    const event = loaderData?.event;
    const title = event ? `${event.title} | אירועים | Agendax` : "אירוע - Agendax";
    const description =
      event?.description?.slice(0, 155) || "דף אירוע מבית Agendax - פרטים והרשמה";
    const url = `${SITE_URL}/events/${params.slug}`;
    const image = event?.image;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: event ? "index, follow" : "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        ...(image && image.startsWith("https://")
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: event
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Event",
                name: event.title,
                description: event.description || undefined,
                startDate: event.date,
                image: event.image ? [event.image] : undefined,
                location: event.location
                  ? { "@type": "Place", name: event.location }
                  : { "@type": "VirtualLocation", url },
                organizer: { "@type": "Organization", name: "Agendax", url: SITE_URL },
              }),
            },
          ]
        : [],
    };
  },
  component: EventLanding,
});
