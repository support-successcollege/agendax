import { createFileRoute } from "@tanstack/react-router";

// Cron target: publishes articles whose scheduled_at has passed.
// Protected by a shared secret so only the scheduler can trigger it.
export const Route = createFileRoute("/api/public/publish-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PLUS_INGEST_SECRET"];
        const provided =
          request.headers.get("x-cron-secret") ??
          new URL(request.url).searchParams.get("secret");
        if (!secret || provided !== secret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const now = new Date().toISOString();

        const { data, error } = await supabaseAdmin
          .from("articles")
          .update({ is_draft: false, scheduled_at: null, published_at: now })
          .eq("is_draft", true)
          .not("scheduled_at", "is", null)
          .lte("scheduled_at", now)
          .select("id, title");

        if (error) {
          console.error("Error publishing scheduled articles:", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        console.log(`Published ${data?.length || 0} scheduled articles`);

        return new Response(
          JSON.stringify({ published: data?.length || 0, articles: data }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
