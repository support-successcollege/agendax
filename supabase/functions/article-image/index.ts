// deno-lint-ignore-file no-explicit-any
// Gives an existing article a real, article-specific image.
//
// The rule this function exists to enforce: no article goes live with a photo
// that has nothing to do with it. The ingest worker prefers the source's own
// photo and falls back to Gemini, but when both fail it used to save a generic
// stock image — which then went live looking deliberate. Now the publish cron
// refuses to publish those, and this function is what clears them.
//
// Body:
//   { articleId, force? }  → generate for one article
//   { sweep: true, max? }  → find articles missing a real image and fix them
//
// Two sources, in this order: the Gemini image models, then a real photograph
// from Pexels when its key is set. A generated image is drawn for this story
// specifically, which no stock library can match; the photo library is the
// safety net for when generation is refused, out of quota, or down — so an
// article is never left wearing the shared placeholder.
import {
  adminClient,
  authorize,
  callModelWithFallback,
  corsHeaders,
  FALLBACK_IMAGE,
  json,
  toolArgs,
  mirrorImageToBucket,
} from "../_shared/ingest.ts";
import { getSecret } from "../_shared/secrets.ts";

/** With the model chain a single article can take ~40s; one per invocation stays inside the wall clock. */
const SWEEP_DEFAULT = 1;

type Article = {
  id: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  image_url: string | null;
  is_draft: boolean;
  scheduled_at: string | null;
};

/** True when the article has no image of its own — null, empty, or the stock fallback. */
function needsImage(url: string | null): boolean {
  const u = (url || "").trim();
  if (!u) return true;
  // The stock fallback, with or without its query string.
  return u.split("?")[0] === FALLBACK_IMAGE.split("?")[0];
}

/**
 * An editorial photo prompt in English, written from the article itself.
 * The model call is the good path; the template below is what keeps a quota
 * error from leaving the article imageless.
 */
async function buildPrompt(article: Article): Promise<string> {
  const fallback =
    `Editorial news photograph illustrating: ${article.title}. ` +
    `Category: ${article.category || "technology"}. Realistic photojournalism, natural light, ` +
    `no text, no logos, no identifiable real people, 16:9 composition.`;
  try {
    const response = await callModelWithFallback({
      messages: [
        {
          role: "system",
          content:
            "You write image prompts for a Hebrew tech-news site. Given a headline and summary, " +
            "write ONE English prompt for a realistic editorial news photograph that illustrates " +
            "the story concretely — the object, place, industry or scene it is actually about, " +
            "never an abstract 'technology' stock cliché. No text in the image, no logos, no " +
            "identifiable real people, 16:9. Return only through the tool.",
        },
        {
          role: "user",
          content: `כותרת: ${article.title}\nתקציר: ${article.excerpt || ""}\nקטגוריה: ${article.category || ""}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "write_image_prompt",
            description: "An English prompt for the article's editorial photo",
            parameters: {
              type: "object",
              properties: { image_prompt: { type: "string" } },
              required: ["image_prompt"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "write_image_prompt" } },
    });
    const out = toolArgs(response) as { image_prompt?: string };
    const prompt = (out.image_prompt || "").trim();
    return prompt.length >= 20 ? prompt : fallback;
  } catch (e) {
    console.error("prompt generation failed, using template", (e as Error).message);
    return fallback;
  }
}

/**
 * Image generation with a model chain, which is the whole reason this function
 * exists as more than a one-liner. The shared generateImage() calls a single
 * model and gives up; on 31/08 that model answered 503 "high demand" for hours
 * straight, which is how articles ended up live carrying a stock photo.
 * Quotas and capacity are per model, so the next one in the list is usually
 * open when the first one is not.
 */
const IMAGE_MODELS = [
  Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
].filter((m, i, all) => !!m && all.indexOf(m) === i);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function renderWithModel(
  model: string,
  prompt: string,
  withAspectRatio = true,
): Promise<{ mime: string; bytes: Uint8Array } | { error: string }> {
  const key = await getSecret("GEMINI_API_KEY");
  if (!key) return { error: "GEMINI_API_KEY חסר" };
  const body: Record<string, unknown> = {
    contents: [
      {
        parts: [
          {
            text:
              `${prompt}. Editorial photojournalism style, realistic, high quality, ` +
              `no text or watermarks, 16:9 composition.`,
          },
        ],
      },
    ],
  };
  // Asked for, not merely described: the same prompt ending in "16:9
  // composition" came back square, and every card and social render crops to
  // 16:9, so a square loses a third of the frame.
  if (withAspectRatio) {
    body.generationConfig = { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } };
  }
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 200);
    // A model that rejects imageConfig should still produce a picture.
    if (resp.status === 400 && withAspectRatio) return await renderWithModel(model, prompt, false);
    return { error: `${resp.status} ${text.replace(/\s+/g, " ")}` };
  }
  const data = await resp.json();
  const part = data.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
  );
  if (!part) return { error: "התשובה לא הכילה תמונה" };
  const mime: string = part.inlineData.mimeType || "image/png";
  const bin = atob(part.inlineData.data as string);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

/**
 * Two or three English words to search a stock library with. The prompt written
 * for the generator is a paragraph of art direction, which matches nothing in a
 * photo library, so the subject is asked for separately.
 */
async function buildSearchQuery(article: Article): Promise<string> {
  try {
    const response = await callModelWithFallback({
      messages: [
        {
          role: "system",
          content:
            "You pick stock-photo search terms for a Hebrew tech-news site. Given a headline, " +
            "return TWO or THREE English words naming the concrete subject a photographer would " +
            "shoot for it — the object, place or activity. No brand names, no adjectives, no " +
            "abstract words like 'technology' or 'innovation'. Return only through the tool.",
        },
        {
          role: "user",
          content: `כותרת: ${article.title}\nתקציר: ${article.excerpt || ""}\nקטגוריה: ${article.category || ""}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "write_search_query",
            description: "Two or three English search words for a stock photo library",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "write_search_query" } },
      max_tokens: 200,
    });
    const query = String((toolArgs(response) as { query?: string }).query ?? "").trim();
    if (query) return query.split(/\s+/).slice(0, 4).join(" ");
  } catch (e) {
    console.error("search query failed, using the category", (e as Error).message);
  }
  return article.category || "technology";
}

/**
 * A landscape photograph from Pexels, mirrored into our own bucket — Pexels
 * URLs are stable but hotlinking them would leak reader traffic and break the
 * day they rotate a CDN.
 */
async function findStockPhoto(
  supabase: any,
  article: Article,
): Promise<{ url: string; model: string } | { error: string }> {
  const key = await getSecret("PEXELS_API_KEY");
  if (!key) return { error: "אין מפתח Pexels" };

  const query = await buildSearchQuery(article);
  try {
    const resp = await fetch(
      `https://api.pexels.com/v1/search?per_page=5&orientation=landscape&query=${encodeURIComponent(query)}`,
      { headers: { Authorization: key } },
    );
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 160).replace(/\s+/g, " ");
      return { error: `Pexels ${resp.status}: ${detail}` };
    }
    const data = await resp.json();
    const photos = (data?.photos ?? []) as { src?: Record<string, string>; alt?: string }[];
    for (const photo of photos) {
      const src = photo.src?.large2x || photo.src?.large || photo.src?.original;
      if (!src) continue;
      const mirrored = await mirrorImageToBucket(supabase, src, 20_000);
      if (mirrored) return { url: mirrored, model: `pexels (${query})` };
    }
    return { error: `Pexels לא החזיר תמונה מתאימה ל-"${query}"` };
  } catch (e) {
    return { error: `Pexels: ${(e as Error).message}` };
  }
}

/**
 * Walks the model chain, two attempts each with a real pause between them —
 * a 503 that clears usually clears in seconds, not milliseconds. Returns the
 * stored public URL, or every failure it collected so the report can say why.
 */
async function generateArticleImage(
  supabase: any,
  prompt: string,
): Promise<{ url: string; model: string } | { error: string }> {
  const failures: string[] = [];
  for (const model of IMAGE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await renderWithModel(model, prompt);
      if ("error" in out) {
        failures.push(`${model}: ${out.error}`);
        // A model that does not exist or rejects the request will not start
        // working on a retry; only capacity errors are worth a second try.
        const transient = /\b(429|500|502|503|504)\b/.test(out.error);
        if (!transient) break;
        if (attempt === 0) await sleep(4000);
        continue;
      }
      const ext = out.mime.split("/")[1]?.split("+")[0] || "png";
      const path = `ingest/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("article-images")
        .upload(path, out.bytes, { contentType: out.mime, upsert: false });
      if (error) {
        failures.push(`${model}: העלאה נכשלה - ${error.message}`);
        break;
      }
      const url = supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;
      if (failures.length) console.log(`תמונה נוצרה במודל גיבוי ${model} (אחרי ${failures.join(" | ")})`);
      return { url, model };
    }
  }
  return { error: failures.join(" | ") || "לא הוגדר אף מודל תמונה" };
}

/**
 * The branded post and story images are cached in storage under the article id.
 * They are rendered from the article photo, so a new photo makes them stale —
 * dropping them makes the next prerender pick the new one up.
 */
async function dropSocialRenders(supabase: any, id: string): Promise<void> {
  const { error } = await supabase.storage
    .from("article-images")
    .remove([`social/${id}.png`, `social/${id}-story.png`]);
  if (error) console.error("social render cleanup failed", id, error.message);
}

async function fixOne(supabase: any, article: Article): Promise<Record<string, unknown>> {
  const prompt = await buildPrompt(article);
  const generated = await generateArticleImage(supabase, prompt);
  let image: { url: string; model: string } | { error: string } = generated;
  if ("error" in generated) {
    // Generation was refused, out of quota or down. A real photograph of the
    // subject beats the shared placeholder, so the library gets its turn.
    const stock = await findStockPhoto(supabase, article);
    // Both failures travel together: on a total failure the editor can see
    // which half broke, and on a fallback why the generator stood down.
    image = "url" in stock ? stock : { error: `${generated.error} | ${stock.error}` };
  }
  if ("error" in image) {
    return { id: article.id, title: article.title, ok: false, error: image.error };
  }
  const { error } = await supabase.from("articles").update({ image_url: image.url }).eq("id", article.id);
  if (error) return { id: article.id, title: article.title, ok: false, error: error.message };
  await dropSocialRenders(supabase, article.id);
  return {
    id: article.id,
    title: article.title,
    ok: true,
    url: image.url,
    // `source` is what the panel's test button reports; `model` stays for the
    // callers that already read it.
    source: image.model.startsWith("pexels") ? "Pexels" : image.model,
    model: image.model,
    prompt,
  };
}

const COLS = "id, title, excerpt, category, image_url, is_draft, scheduled_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = adminClient();

  try {
    const body = await req.json().catch(() => ({}));

    // ---------- sweep: everything still missing a real image ----------
    if (body?.sweep) {
      const max = Math.min(Math.max(Number(body?.max) || SWEEP_DEFAULT, 1), 3);
      // Filtered in code rather than in the query: the fallback URL carries a
      // query string, and PostgREST's `or` syntax treats its punctuation as
      // its own — the filter silently matched nothing.
      const { data, error } = await supabase
        .from("articles")
        .select(COLS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(`שליפת הכתבות נכשלה: ${error.message}`);

      // A draft whose slot is closest is the most urgent: it is the next one
      // the publish cron will refuse. Live articles come last — they are
      // already out there, so a few more minutes changes nothing.
      const pending = ((data ?? []) as Article[])
        .filter((a) => needsImage(a.image_url))
        .sort((a, b) => {
          const rank = (x: Article) => (x.is_draft && x.scheduled_at ? 0 : x.is_draft ? 1 : 2);
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return (a.scheduled_at || "").localeCompare(b.scheduled_at || "");
        });

      const results: Record<string, unknown>[] = [];
      for (const article of pending.slice(0, max)) results.push(await fixOne(supabase, article));
      return json({ ok: true, sweep: true, pending: pending.length, handled: results });
    }

    // ---------- one article ----------
    const articleId = String(body?.articleId || "");
    if (!articleId) return json({ error: "חסר מזהה כתבה" }, 400);

    const { data: article, error: artErr } = await supabase
      .from("articles")
      .select(COLS)
      .eq("id", articleId)
      .maybeSingle();
    if (artErr || !article) return json({ error: "הכתבה לא נמצאה" }, 404);

    // Replacing a good photo is a deliberate act, never a side effect.
    if (!needsImage(article.image_url) && !body?.force) {
      return json({ ok: true, skipped: true, reason: "לכתבה כבר יש תמונה משלה", url: article.image_url });
    }

    const result = await fixOne(supabase, article as Article);
    return json(result, result.ok ? 200 : 502);
  } catch (e: any) {
    console.error("article-image error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
