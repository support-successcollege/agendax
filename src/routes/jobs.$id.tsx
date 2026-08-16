import { createFileRoute } from "@tanstack/react-router";
import JobDetail from "@/pages/JobDetail";
import { jobQueryOptions } from "@/lib/queries";

const SITE_URL = "https://yznews.store";

export const Route = createFileRoute("/jobs/$id")({
  loader: async ({ params, context }) => {
    const job = await context.queryClient.ensureQueryData(jobQueryOptions(params.id));
    return {
      job:
        job && job.is_active
          ? {
              title: job.title,
              company: job.company_name,
              location: job.location,
              description: job.description,
              image: job.image_url,
              created_at: job.created_at,
            }
          : null,
    };
  },
  head: ({ loaderData, params }) => {
    const job = loaderData?.job;
    const title = job
      ? `${job.title} ב${job.company} | אזור התעסוקה | YZ News`
      : "משרה - YZ News";

    const description =
      job?.description?.replace(/<[^>]*>/g, " ").slice(0, 155) ||
      "פרטי משרה באזור התעסוקה של YZ News";
    const url = `${SITE_URL}/jobs/${params.id}`;
    const image = job?.image;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: job ? "index, follow" : "noindex" },
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
      scripts: job
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "JobPosting",
                title: job.title,
                description: job.description,
                datePosted: job.created_at,
                hiringOrganization: {
                  "@type": "Organization",
                  name: job.company,
                },
                jobLocation: job.location
                  ? {
                      "@type": "Place",
                      address: { "@type": "PostalAddress", addressLocality: job.location },
                    }
                  : undefined,
              }),
            },
          ]
        : [],
    };
  },
  component: JobDetail,
});
