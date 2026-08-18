// Shared plumbing for the global hi-tech ingest pipeline.
//
// Directories under supabase/functions/ whose name starts with "_" are not
// deployed as functions of their own — the CLI just bundles them into whoever
// imports them.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { marked } from "https://esm.sh/marked@12.0.2";

export const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const TEXT_MODEL = "gemini-3.6-flash";
export const IMAGE_MODEL = "gemini-3.1-flash-image";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * These functions run with verify_jwt = false because pg_cron calls them from
 * inside the database and carries no user session. Two callers are allowed:
 * cron, holding the shared secret, and a logged-in admin pressing the button in
 * the admin panel. Anything else is rejected before any work happens.
 */
export async function authorize(req: Request): Promise<{ trigger: "cron" | "manual" } | Response> {
  const expected = Deno.env.get("INGEST_CRON_SECRET");
  const provided = req.headers.get("x-ingest-secret");
  if (expected && provided && provided === expected) return { trigger: "cron" };

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: data.claims.sub,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "Forbidden: admin role required" }, 403);
  return { trigger: "manual" };
}

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

export type FeedItem = {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    // Removing a tag leaves a space behind, which strands punctuation: "text <em>x</em>." -> "text x ."
    .replace(/\s+([.,;:!?%)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
}

/**
 * Feed payloads are escaped inconsistently: RSS wraps raw HTML in CDATA, Atom
 * entity-escapes it (`&lt;p&gt;`), and a few feeds do both. Strip, decode, then
 * strip again so markup that only became markup after decoding also goes away.
 */
function unwrap(raw: string): string {
  return stripTags(stripTags(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")));
}

function tagValue(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  return m ? unwrap(m[1]) : "";
}

/** Atom puts the URL in an attribute, RSS puts it in the element body. */
function atomLink(block: string): string {
  const alt = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(block);
  if (alt) return alt[1];
  const plain = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  if (plain) return plain[1];
  return tagValue(block, "link");
}

function toIso(raw: string): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Handles RSS 2.0 (<item>) and Atom (<entry>) with the same code path. */
export function parseFeed(xml: string, max = 25): FeedItem[] {
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blocks = isAtom
    ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)]
    : [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)];

  return blocks
    .slice(0, max)
    .map((m) => {
      const block = m[0];
      const title = tagValue(block, "title");
      const link = isAtom ? atomLink(block) : tagValue(block, "link") || atomLink(block);
      const summary =
        tagValue(block, "description") ||
        tagValue(block, "summary") ||
        tagValue(block, "content:encoded") ||
        tagValue(block, "content");
      const published =
        toIso(tagValue(block, "pubDate")) ||
        toIso(tagValue(block, "published")) ||
        toIso(tagValue(block, "updated")) ||
        toIso(tagValue(block, "dc:date"));
      return { title, link: link.trim(), summary: summary.slice(0, 600), publishedAt: published };
    })
    .filter((it) => it.title && /^https?:\/\//i.test(it.link));
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AgendaxBot/1.0; +https://agendax.co.il)",
  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
  "Accept-Language": "en,he;q=0.8",
};

export async function fetchFeed(
  feedUrl: string,
  timeoutMs = 12000,
): Promise<{ ok: true; items: FeedItem[] } | { ok: false; error: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(feedUrl, { redirect: "follow", signal: ctrl.signal, headers: BROWSER_HEADERS });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const xml = await resp.text();
    const items = parseFeed(xml);
    if (items.length === 0) return { ok: false, error: "no items parsed" };
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "fetch failed" };
  }
}

// ---------------------------------------------------------------------------
// Article body extraction
// ---------------------------------------------------------------------------

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?%)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
}

/** Follows redirects (Google News links in particular) and returns plain text. */
export async function fetchArticleText(
  url: string,
  timeoutMs = 15000,
  maxChars = 14000,
): Promise<{ url: string; text: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: BROWSER_HEADERS });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = htmlToText(html).slice(0, maxChars);
    if (text.length < 300) return null;
    return { url: resp.url || url, text };
  } catch (e) {
    console.error("fetchArticleText failed", url, (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dedupe key
// ---------------------------------------------------------------------------

const TRACKING_PARAM = /^(utm_|ref$|ref_|source$|src$|at_|fbclid$|gclid$|mc_|_hs|guccounter)/i;

/**
 * Strips everything that varies between outlets syndicating the same link:
 * scheme, www, tracking params, trailing slash, fragment. Two feeds carrying
 * the same story therefore collapse to one row.
 */
export function urlKey(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAM.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${qs}`.toLowerCase().slice(0, 400);
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").slice(0, 400);
  }
}

// ---------------------------------------------------------------------------
// Markdown → the site's article HTML
// ---------------------------------------------------------------------------

/**
 * Same class set generate-article emits, so an ingested draft and a manually
 * generated one render identically inside RichHtmlContent. RTL-aware: list
 * padding and blockquote borders are on the right.
 */
export function mdToArticleHtml(md: string): string {
  let cleaned = (md || "").trim();
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  marked.setOptions({ gfm: true, breaks: true });
  let html = marked.parse(cleaned) as string;
  html = html
    .replace(/<h1>/g, '<h1 class="text-3xl md:text-4xl font-bold text-foreground mt-8 mb-4">')
    .replace(/<h2>/g, '<h2 class="text-2xl md:text-3xl font-bold text-foreground mt-8 mb-4 border-b-2 border-primary/20 pb-2">')
    .replace(/<h3>/g, '<h3 class="text-xl md:text-2xl font-bold text-foreground mt-6 mb-3">')
    .replace(/<h4>/g, '<h4 class="text-lg font-bold text-foreground mt-4 mb-2">')
    .replace(/<p>/g, '<p class="text-foreground/90 leading-relaxed mb-4">')
    .replace(/<ul>/g, '<ul class="list-disc pr-6 space-y-2 my-4 text-foreground/90">')
    .replace(/<ol>/g, '<ol class="list-decimal pr-6 space-y-2 my-4 text-foreground/90">')
    .replace(/<li>/g, '<li class="leading-relaxed">')
    .replace(/<blockquote>/g, '<blockquote class="border-r-4 border-primary pr-4 my-6 italic text-foreground/75 bg-muted/30 py-4 rounded-l-lg">')
    .replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80" ')
    .replace(/<strong>/g, '<strong class="font-bold text-foreground">')
    .replace(/<table>/g, '<div class="overflow-x-auto my-6"><table class="w-full border-collapse border border-border text-sm">')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/<thead>/g, '<thead class="bg-muted">')
    .replace(/<th>/g, '<th class="border border-border px-3 py-2 text-right font-bold">')
    .replace(/<td>/g, '<td class="border border-border px-3 py-2 text-right">')
    .replace(/<hr>/g, '<hr class="my-8 border-border" />');
  return html;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORY_SLUGS: Record<string, string> = {
  "חדשות": "news",
  "טכנולוגיה": "technology",
  "כלכלה": "economy",
  "פוליטיקה": "politics",
  "אקטואליה": "current",
  "שוק ההון": "stocks",
};

/** Prefers the categories actually configured in the DB, falls back to the map. */
export async function resolveCategory(
  supabase: SupabaseClient,
  name: string | null | undefined,
): Promise<{ category: string; category_slug: string }> {
  const wanted = (name || "טכנולוגיה").trim();
  const { data } = await supabase
    .from("categories")
    .select("name, slug")
    .eq("is_active", true);
  const match = (data || []).find((c: { name: string }) => c.name === wanted);
  if (match) return { category: match.name, category_slug: match.slug };
  if (CATEGORY_SLUGS[wanted]) return { category: wanted, category_slug: CATEGORY_SLUGS[wanted] };
  return { category: "טכנולוגיה", category_slug: "technology" };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

export async function callModel(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY חסר");
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL, ...body }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("חריגה ממכסת הבקשות של Gemini, נסו שוב בעוד רגע");
    throw new Error(`Gemini ${resp.status}: ${text.slice(0, 300)}`);
  }
  return await resp.json();
}

/** Returns the parsed arguments of a forced tool call. */
export function toolArgs(data: Record<string, unknown>): Record<string, unknown> {
  const choices = (data as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] }).choices;
  const raw = choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!raw) throw new Error("המודל לא החזיר תשובה בפורמט הצפוי");
  return JSON.parse(raw);
}

/** Generates a 16:9 editorial image and returns its public storage URL. */
export async function generateImage(
  supabase: SupabaseClient,
  prompt: string,
): Promise<string | null> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${prompt}. Editorial photojournalism style, realistic, high quality, no text or watermarks, 16:9 composition.`,
                },
              ],
            },
          ],
        }),
      },
    );
    if (!resp.ok) {
      console.error("image gen failed", resp.status, (await resp.text()).slice(0, 200));
      return null;
    }
    const data = await resp.json();
    const part = data.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
    );
    if (!part) return null;

    const mime: string = part.inlineData.mimeType || "image/png";
    const bin = atob(part.inlineData.data as string);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const ext = mime.split("/")[1]?.split("+")[0] || "png";
    const path = `ingest/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("article-images")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) {
      console.error("image upload failed", error);
      return null;
    }
    return supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("image gen exception", e);
    return null;
  }
}

export const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&h=675&fit=crop";
