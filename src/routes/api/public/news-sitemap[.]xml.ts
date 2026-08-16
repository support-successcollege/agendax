import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/news-sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const {
          buildNewsSitemapXml,
          xmlResponse,
          sitemapErrorResponse,
        } = await import("@/lib/sitemap.server");
        try {
          return xmlResponse(await buildNewsSitemapXml(), 300);
        } catch (err) {
          return sitemapErrorResponse("news sitemap", err);
        }
      },
    },
  },
});
