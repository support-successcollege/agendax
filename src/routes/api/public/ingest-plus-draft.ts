import { createFileRoute } from "@tanstack/react-router";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; contentType: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1] || "image/png";
  const isBase64 = !!m[2];
  const data = m[3] ?? "";
  if (isBase64) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType };
  }
  return {
    bytes: new TextEncoder().encode(decodeURIComponent(data)),
    contentType,
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "post";

const plainToHtml = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.trim().replace(/\n/g, "<br />")}</p>`)
    .filter(Boolean)
    .join("\n");

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/ingest-plus-draft")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["PLUS_INGEST_SECRET"];
        if (!expected) return json(500, { error: "Server not configured" });

        const provided = request.headers.get("x-plus-secret");
        if (!provided || !timingSafeEqual(provided, expected)) {
          return json(401, { error: "Unauthorized" });
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json(400, { error: "Invalid JSON" });
        }

        const headline =
          typeof body?.["headline"] === "string"
            ? (body["headline"] as string).trim()
            : "";
        const article =
          typeof body?.["article"] === "string"
            ? (body["article"] as string).trim()
            : "";
        const bgDataUrl =
          typeof body?.["bgDataUrl"] === "string"
            ? (body["bgDataUrl"] as string)
            : "";
        const author =
          typeof body?.["author"] === "string" && (body["author"] as string).trim()
            ? (body["author"] as string).trim()
            : "מחולל AI";

        if (!headline || !article) {
          return json(400, { error: "Missing headline or article" });
        }
        if (headline.length > 300) return json(400, { error: "Headline too long" });
        if (article.length > 50000) return json(400, { error: "Article too long" });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Upload image (optional)
        let imageUrl = "";
        if (bgDataUrl) {
          const parsed = dataUrlToBytes(bgDataUrl);
          if (parsed) {
            const ext =
              parsed.contentType.split("/")[1]?.split("+")[0] || "png";
            const path = `plus/${Date.now()}-${slugify(headline)}.${ext}`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("article-images")
              .upload(path, parsed.bytes, {
                contentType: parsed.contentType,
                upsert: false,
              });
            if (upErr) {
              console.error("Image upload failed:", upErr);
            } else {
              const { data: pub } = supabaseAdmin.storage
                .from("article-images")
                .getPublicUrl(path);
              imageUrl = pub.publicUrl;
            }
          }
        }

        const paragraphs = article
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        const excerpt = (paragraphs[0] ?? article).slice(0, 200);
        const content = plainToHtml(article);

        // Insert as draft — uncategorized so admin sets category manually
        const { data, error } = await supabaseAdmin
          .from("articles")
          .insert({
            title: headline,
            excerpt,
            content,
            category: "ללא קטגוריה",
            category_slug: "uncategorized",
            image_url: imageUrl || "https://placehold.co/1200x800?text=YZ+News",
            author,
            is_draft: true,
            is_breaking: false,
            is_featured: false,
          })
          .select("id")
          .single();

        if (error) {
          console.error("Insert failed:", error);
          return json(500, { error: error.message });
        }

        return json(200, { ok: true, id: data.id });
      },
    },
  },
});
