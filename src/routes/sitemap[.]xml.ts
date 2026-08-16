import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const {
          buildSitemapXml,
          xmlResponse,
          sitemapErrorResponse,
        } = await import("@/lib/sitemap.server");
        try {
          return xmlResponse(await buildSitemapXml(), 600);
        } catch (err) {
          return sitemapErrorResponse("sitemap", err);
        }
      },
    },
  },
});
