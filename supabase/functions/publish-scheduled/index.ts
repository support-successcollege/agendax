import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("articles")
    .update({ is_draft: false, scheduled_at: null, published_at: now })
    .eq("is_draft", true)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now)
    .select("id, title");

  if (error) {
    console.error("Error publishing scheduled articles:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`Published ${data?.length || 0} scheduled articles:`, data?.map(a => a.title));

  return new Response(JSON.stringify({ published: data?.length || 0, articles: data }), {
    headers: { "Content-Type": "application/json" },
  });
});
