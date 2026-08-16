import { createFileRoute } from "@tanstack/react-router";
import CourseLanding from "@/pages/CourseLanding";
import { courseQueryOptions } from "@/lib/queries";

const SITE_URL = "https://yznews.store";

export const Route = createFileRoute("/courses/$slug")({
  loader: async ({ params, context }) => {
    const course = await context.queryClient.ensureQueryData(
      courseQueryOptions(params.slug),
    );
    return {
      course:
        course && course.is_published
          ? {
              title: course.title,
              description: course.short_description || course.description || "",
              image: course.cover_image_url,
            }
          : null,
    };
  },
  head: ({ loaderData, params }) => {
    const course = loaderData?.course;
    const title = course ? `${course.title} | קורסים | YZ News` : "קורס - YZ News";
    const description =
      course?.description?.slice(0, 155) || "דף קורס מבית YZ News - פרטים, סילבוס והרשמה";
    const url = `${SITE_URL}/courses/${params.slug}`;
    const image = course?.image;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: course ? "index, follow" : "noindex" },
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
    };
  },
  component: CourseLanding,
});
