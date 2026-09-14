// deno-lint-ignore-file no-explicit-any
//
// Builds a carousel post for an article, in stages the panel drives.
//
//   { action: "create", articleId }           script + image requests → carousel
//   { action: "tick", id }                    collect finished images, render ONE slide
//   { action: "update", id, caption, slides } edit the words; changed slides re-render
//   { action: "regenerate", id, index }       a new background for one slide
//
// Why the stages: the script takes a model call, each background is an
// asynchronous Higgsfield generation that finishes whenever it finishes, and a
// slide render is heavy enough that two in one worker exhaust it. So `create`
// returns as soon as the requests are submitted, and the panel calls `tick`
// every few seconds until every slide has its PNG. A closed panel just leaves
// the carousel paused; opening it again resumes from where it stopped.
//
// Words are never drawn by the image model. Higgsfield supplies the picture;
// the Hebrew is typeset here, because image models misspell it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  authorize,
  callClaude,
  callModelWithFallback,
  corsHeaders,
  htmlToText,
  json,
  mirrorImageToBucket,
  toolArgs,
} from "../_shared/ingest.ts";
import { checkImage, higgsfieldConfigured, submitImage } from "../_shared/higgsfield.ts";
import { categoryColor, renderCarouselSlidePng } from "../_shared/postImage.ts";

type SlideKind = "cover" | "point" | "cta";

type Slide = {
  kind: SlideKind;
  title: string;
  body: string;
  prompt: string;
  hf_request_id: string | null;
  bg_url: string | null;
  bg_source: "higgsfield" | "article" | null;
  bg_error: string | null;
  png_url: string | null;
  /** Bumped on every change, so a re-render gets a fresh URL past every cache. */
  version: number;
};

type Carousel = {
  id: string;
  article_id: string;
  status: "generating" | "ready" | "failed";
  caption: string;
  slides: Slide[];
  error: string | null;
  created_at: string;
  updated_at: string;
};

const BUCKET = "article-images";
const MIN_SLIDES = 5;
const MAX_SLIDES = 8;

/**
 * Appended to every image prompt server-side rather than trusted to the script
 * writer. The text rule keeps the model from painting garbled letters under the
 * real typography; the faces rule is the one the AI policy page promises.
 */
const VISUAL_SUFFIX =
  ", editorial magazine illustration, cinematic lighting, deep navy and electric cyan palette, " +
  "vertical 4:5 composition with calm dark negative space in the lower half, " +
  "absolutely no text, no letters, no numbers, no logos, no watermark, " +
  "no identifiable real people, no recognizable faces";

const SCRIPT_TOOL = {
  type: "function",
  function: {
    name: "write_carousel",
    description: "Writes an Instagram/Facebook carousel for a news article, in Hebrew.",
    parameters: {
      type: "object",
      properties: {
        caption: {
          type: "string",
          description:
            "Hebrew post caption: 2-4 short lines that make the reader want to swipe, a closing line pointing to the full story on the site, then 4-6 relevant hashtags. No URL.",
        },
        slides: {
          type: "array",
          minItems: MIN_SLIDES,
          maxItems: MAX_SLIDES,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["cover", "point", "cta"] },
              title: {
                type: "string",
                description: "Hebrew. Cover: a sharp hook, max 70 chars. Point: the takeaway, max 55 chars. CTA: max 40 chars.",
              },
              body: {
                type: "string",
                description: "Hebrew. Cover: optional one-line subtitle, max 90 chars. Point: 1-3 sentences, max 220 chars. CTA: max 90 chars.",
              },
              visual_prompt: {
                type: "string",
                description:
                  "English prompt for this slide's background image: a concrete visual metaphor for the slide's idea (objects, places, abstract tech imagery). Never text, never real people.",
              },
            },
            required: ["kind", "title", "body", "visual_prompt"],
          },
        },
      },
      required: ["caption", "slides"],
    },
  },
};

const SYSTEM = [
  "אתה עורך הרשתות החברתיות של Agendax, אתר חדשות טכנולוגיה ועסקים בעברית.",
  "אתה בונה קרוסלה לאינסטגרם ולפייסבוק מתוך כתבה שפורסמה באתר.",
  "",
  "מבנה חובה:",
  "- שקף ראשון מסוג cover: כותרת שגורמת לעצור את הגלילה, בלי קליקבייט ובלי הבטחה שהכתבה לא מקיימת.",
  "- שקפי point: כל שקף נקודה אחת שקורא לומד ממנה משהו. מספר, עובדה, השלכה. לא חזרה על הכותרת.",
  "- שקף אחרון מסוג cta: הזמנה לקרוא את הכתבה המלאה באתר.",
  "",
  "כללי אמת — אין עליהם פשרה:",
  "- רק עובדות שמופיעות בכתבה. אל תוסיף מידע, הקשר או הערכה שלא נמצאים בה.",
  "- מספרים, סכומים ותאריכים בדיוק כפי שהם בכתבה.",
  "- אין ציטוטים שלא מופיעים בכתבה כלשונם.",
  "- אין המלצות השקעה.",
  "",
  "סגנון: עברית טבעית וחדה, משפטים קצרים, בלי אימוג'י בשקפים. באפשרותך להשתמש באימוג'י אחד או שניים בכיתוב בלבד.",
].join("\n");

const pathFor = (carouselId: string, index: number, version: number) =>
  `social/carousels/${carouselId}/${index}-v${version}.png`;

async function loadCarousel(supabase: any, id: string): Promise<Carousel> {
  const { data, error } = await supabase.from("social_carousels").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("הקרוסלה לא נמצאה");
  return data as Carousel;
}

async function saveCarousel(supabase: any, c: Carousel, patch: Partial<Carousel> = {}) {
  const row = { ...c, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from("social_carousels")
    .update({ status: row.status, caption: row.caption, slides: row.slides, error: row.error, updated_at: row.updated_at })
    .eq("id", c.id);
  if (error) throw new Error(error.message);
  return row as Carousel;
}

async function loadArticle(supabase: any, articleId: string) {
  const { data } = await supabase
    .from("articles")
    .select("id, title, excerpt, content, category, category_slug, image_url")
    .eq("id", articleId)
    .maybeSingle();
  if (!data) throw new Error("הכתבה לא נמצאה");
  return data;
}

/** Starts one slide's background. Falls back to the article photo when it cannot. */
async function startBackground(slide: Slide, articleImage: string): Promise<Slide> {
  if (!higgsfieldConfigured()) {
    return { ...slide, hf_request_id: null, bg_url: articleImage, bg_source: "article", bg_error: "Higgsfield לא מוגדר" };
  }
  try {
    const requestId = await submitImage(`${slide.prompt}${VISUAL_SUFFIX}`);
    return { ...slide, hf_request_id: requestId, bg_url: null, bg_source: null, bg_error: null };
  } catch (e) {
    return { ...slide, hf_request_id: null, bg_url: articleImage, bg_source: "article", bg_error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- actions

async function create(supabase: any, articleId: string): Promise<Carousel> {
  const article = await loadArticle(supabase, articleId);
  const text = htmlToText(article.content || "").slice(0, 12_000);

  const request = {
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `קטגוריה: ${article.category}\nכותרת: ${article.title}\nתקציר: ${article.excerpt}\n\nגוף הכתבה:\n${text}`,
      },
    ],
    tools: [SCRIPT_TOOL],
    tool_choice: { type: "function", function: { name: "write_carousel" } },
    max_tokens: 4000,
  };

  // Claude writes the Hebrew best; the Gemini chain is there so a Claude outage
  // does not take the feature down with it.
  let args: any;
  try {
    args = toolArgs(await callClaude(request));
  } catch (e) {
    console.error("carousel script: Claude failed, falling back", (e as Error).message);
    args = toolArgs(await callModelWithFallback(request));
  }

  const raw: any[] = Array.isArray(args?.slides) ? args.slides : [];
  const cleaned = raw
    .map((s) => ({
      title: String(s?.title ?? "").trim(),
      body: String(s?.body ?? "").trim(),
      prompt: String(s?.visual_prompt ?? "").trim() || "abstract technology newsroom scene",
    }))
    .filter((s) => s.title)
    .slice(0, MAX_SLIDES);
  if (cleaned.length < MIN_SLIDES) throw new Error(`המודל החזיר ${cleaned.length} שקפים בלבד`);

  // The kinds follow position, whatever the model labelled them: the renderer
  // depends on a cover first and a call to action last.
  const slides: Slide[] = cleaned.map((s, i) => ({
    kind: i === 0 ? "cover" : i === cleaned.length - 1 ? "cta" : "point",
    ...s,
    hf_request_id: null,
    bg_url: null,
    bg_source: null,
    bg_error: null,
    png_url: null,
    version: 1,
  }));

  const started = await Promise.all(slides.map((s) => startBackground(s, article.image_url)));

  const { data, error } = await supabase
    .from("social_carousels")
    .insert({
      article_id: article.id,
      status: "generating",
      caption: String(args?.caption ?? "").trim(),
      slides: started,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Carousel;
}

async function tick(supabase: any, id: string): Promise<Carousel> {
  let carousel = await loadCarousel(supabase, id);
  if (carousel.status === "failed") return carousel;
  const article = await loadArticle(supabase, carousel.article_id);
  const slides = [...carousel.slides];
  let changed = false;

  // 1. Collect whatever Higgsfield has finished.
  await Promise.all(
    slides.map(async (slide, i) => {
      if (slide.bg_url || !slide.hf_request_id) return;
      const status = await checkImage(slide.hf_request_id);
      if (status.state === "pending") return;
      changed = true;
      if (status.state === "completed") {
        // Higgsfield keeps output for about a week; a carousel scheduled further
        // out would publish a dead link, so the image moves into our bucket.
        const mirrored = await mirrorImageToBucket(supabase, status.imageUrl, 30_000);
        slides[i] = { ...slide, bg_url: mirrored ?? status.imageUrl, bg_source: "higgsfield", bg_error: mirrored ? null : "העותק לאחסון נכשל — התמונה זמנית" };
      } else {
        slides[i] = { ...slide, bg_url: article.image_url, bg_source: "article", bg_error: status.reason };
      }
    }),
  );

  // 2. Render one slide — one per worker, the renderer's hard limit.
  const next = slides.findIndex((s) => s.bg_url && !s.png_url);
  if (next >= 0) {
    const slide = slides[next];
    const png = await renderCarouselSlidePng({
      kind: slide.kind,
      title: slide.title,
      body: slide.body,
      index: next,
      total: slides.length,
      category: article.category,
      categoryColor: categoryColor(article.category_slug || article.category),
      photoUrl: slide.bg_url!,
    });
    const path = pathFor(carousel.id, next, slide.version);
    const { error } = await supabase.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`שמירת השקף נכשלה: ${error.message}`);
    slides[next] = { ...slide, png_url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
    changed = true;
  }

  const ready = slides.every((s) => s.png_url);
  const status = ready ? "ready" : "generating";
  if (changed || status !== carousel.status) {
    carousel = await saveCarousel(supabase, carousel, { slides, status });
  }
  return carousel;
}

async function update(
  supabase: any,
  id: string,
  caption: unknown,
  edits: unknown,
): Promise<Carousel> {
  const carousel = await loadCarousel(supabase, id);
  const list = Array.isArray(edits) ? edits : [];
  const slides = carousel.slides.map((slide, i) => {
    const edit = list[i] as { title?: unknown; body?: unknown } | undefined;
    if (!edit) return slide;
    const title = String(edit.title ?? slide.title).trim();
    const body = String(edit.body ?? slide.body).trim();
    if (title === slide.title && body === slide.body) return slide;
    return { ...slide, title, body, png_url: null, version: slide.version + 1 };
  });
  const dirty = slides.some((s) => !s.png_url);
  return await saveCarousel(supabase, carousel, {
    caption: typeof caption === "string" ? caption.trim() : carousel.caption,
    slides,
    status: dirty ? "generating" : carousel.status,
  });
}

async function regenerate(supabase: any, id: string, index: number, prompt: unknown): Promise<Carousel> {
  const carousel = await loadCarousel(supabase, id);
  const slide = carousel.slides[index];
  if (!slide) throw new Error("שקף לא קיים");
  const article = await loadArticle(supabase, carousel.article_id);
  const base: Slide = {
    ...slide,
    prompt: typeof prompt === "string" && prompt.trim() ? prompt.trim() : slide.prompt,
    png_url: null,
    version: slide.version + 1,
  };
  const started = await startBackground(base, article.image_url);
  const slides = carousel.slides.map((s, i) => (i === index ? started : s));
  return await saveCarousel(supabase, carousel, { slides, status: "generating" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = adminClient();
    const id = String(body?.id ?? "");

    switch (body?.action) {
      case "create": {
        const articleId = String(body?.articleId ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(articleId)) return json({ error: "חסר מזהה כתבה" }, 400);
        return json({ carousel: await create(supabase, articleId), higgsfield: higgsfieldConfigured() });
      }
      case "tick":
        return json({ carousel: await tick(supabase, id) });
      case "update":
        return json({ carousel: await update(supabase, id, body?.caption, body?.slides) });
      case "regenerate":
        return json({ carousel: await regenerate(supabase, id, Number(body?.index), body?.prompt) });
      default:
        return json({ error: "פעולה לא מוכרת" }, 400);
    }
  } catch (e: any) {
    console.error("social-carousel error", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
