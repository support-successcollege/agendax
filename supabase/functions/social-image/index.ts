// deno-lint-ignore-file no-explicit-any
// Renders one branded social image (the 4:5 post or the 9:16 story) for an
// article and caches it in storage. Lives in its own function so every render
// gets a fresh worker: satori + resvg on a 1080×1920 canvas is heavy enough
// that two renders inside the publisher blew the worker's resource limit.
//
// Body: { articleId, variant: "post" | "story" }  →  { url }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";
import { renderPostPng, renderStoryPng } from "../_shared/postImage.ts";

const PALETTE = ["#0d3c99", "#7c3aed", "#0f766e", "#be123c", "#b45309", "#166534", "#0e7490", "#9d174d"];
function categoryColor(key: string): string {
  const s = (key || "").trim().toLowerCase();
  if (!s) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const articleId = String(body?.articleId || "");
    const variant = body?.variant === "story" ? "story" : "post";
    if (!articleId) return json({ error: "חסר מזהה כתבה" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: article } = await supabase
      .from("articles")
      .select("id, title, category, category_slug, image_url")
      .eq("id", articleId)
      .maybeSingle();
    if (!article) return json({ error: "הכתבה לא נמצאה" }, 404);

    const path = variant === "story" ? `social/${article.id}-story.png` : `social/${article.id}.png`;
    const publicUrl = supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;

    if (!body?.force) {
      const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
      if (head?.ok) return json({ url: publicUrl, cached: true });
    }

    const opts = {
      title: article.title,
      category: article.category,
      categoryColor: categoryColor(article.category_slug || article.category),
      photoUrl: article.image_url,
    };
    const png = variant === "story" ? await renderStoryPng(opts) : await renderPostPng(opts);
    const { error } = await supabase.storage
      .from("article-images")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (error) throw error;
    return json({ url: publicUrl, cached: false });
  } catch (e: any) {
    console.error("social-image error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
