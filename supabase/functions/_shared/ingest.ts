// Shared plumbing for the global hi-tech ingest pipeline.
//
// Directories under supabase/functions/ whose name starts with "_" are not
// deployed as functions of their own — the CLI just bundles them into whoever
// imports them.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { marked } from "https://esm.sh/marked@12.0.2";

export const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const TEXT_MODEL = "gemini-3.6-flash";
export const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = "claude-sonnet-5";
// Overridable without a redeploy: the image-model id churned three times in
// one evening, so it lives in a secret rather than in code.
//   supabase secrets set GEMINI_IMAGE_MODEL=gemini-3-pro-image
export const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image";

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
  /** Lead image carried by the feed item, when the feed provides one. */
  image: string | null;
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

/**
 * Lead image of a feed item. rss.app (and most modern feeds) attach one as
 * media:content / media:thumbnail / an image enclosure; older feeds embed an
 * <img> inside the encoded content. First https URL wins.
 */
function itemImage(block: string): string | null {
  const candidates = [
    /<media:content[^>]*url=["']([^"']+)["'][^>]*>/i.exec(block)?.[1],
    /<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i.exec(block)?.[1],
    /<enclosure[^>]*type=["']image\/[^"']*["'][^>]*url=["']([^"']+)["']/i.exec(block)?.[1],
    /<enclosure[^>]*url=["']([^"']+\.(?:jpe?g|png|webp|gif))["']/i.exec(block)?.[1],
    /<img[^>]*src=["']([^"']+)["']/i.exec(block)?.[1],
  ];
  for (const url of candidates) {
    if (url && /^https:\/\//i.test(url)) return url.slice(0, 1000);
  }
  return null;
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
      return {
        title,
        link: link.trim(),
        summary: summary.slice(0, 600),
        publishedAt: published,
        image: itemImage(block),
      };
    })
    .filter((it) => it.title && /^https?:\/\//i.test(it.link));
}

// A plain browser UA, not a bot signature: Cloudflare-fronted feeds (Geektime,
// MarkTechPost, PCMag and a third of the source list) return 403 to anything
// that self-identifies as a bot, RSS reader or unknown agent — the feeds are
// public, the block is UA heuristics.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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

// Aliases the model tends to produce, mapped onto the real Agendax category
// names. Kept as name→name (not name→slug) so the slug always comes from the
// categories table and can never drift from it.
const CATEGORY_ALIASES: Record<string, string> = {
  "טכנולוגיה": "הייטק",
  "AI": "בינה מלאכותית",
  "שוק ההון": "שווקים",
  "כלכלה": "שווקים",
  "סטארטאפים": "חברות",
};

/**
 * Resolves a category name against the live categories table. The slug is
 * always the table's — a hardcoded name→slug map here once outlived a rebrand
 * and produced articles whose slug matched no category page.
 */
export async function resolveCategory(
  supabase: SupabaseClient,
  name: string | null | undefined,
): Promise<{ category: string; category_slug: string }> {
  const wanted = (name || "").trim();
  const { data } = await supabase
    .from("categories")
    .select("name, slug")
    .eq("is_active", true)
    .neq("slug", "home");
  const live = (data || []) as { name: string; slug: string }[];

  // Exact live-name match always wins. Aliases only run when the name isn't a
  // real category — otherwise renaming a category to an aliased name (which
  // already happened once) would silently reroute it.
  const match =
    live.find((c) => c.name === wanted) ??
    live.find((c) => c.name === (CATEGORY_ALIASES[wanted] ?? "")) ??
    live.find((c) => c.name === "הייטק") ??
    live[0];
  if (match) return { category: match.name, category_slug: match.slug };
  // Only reachable when the categories table is empty.
  return { category: "הייטק", category_slug: "hightech" };
}

// ---------------------------------------------------------------------------
// Daily quota
// ---------------------------------------------------------------------------

export type IngestStats = {
  publishedToday: number;
  queued: number;
  /** Per active category, not per site. Already the EFFECTIVE value for
   * today: weekdays use daily_target, Friday/Saturday (Israel) weekend_target. */
  dailyTarget: number;
  queueBuffer: number;
  lookbackHours: number;
  categoryCount: number;
};

export type CategoryStat = {
  bucket: string;
  name: string;
  publishedToday: number;
  queued: number;
};

const STATS_FALLBACK: IngestStats = {
  publishedToday: 0,
  queued: 0,
  dailyTarget: 10,
  queueBuffer: 3,
  lookbackHours: 24,
  categoryCount: 1,
};

/**
 * Single source of truth for "how many did we publish today and how many are
 * still queued". The day boundary is Israel local midnight, computed in SQL —
 * doing it here would mean guessing the offset and getting DST wrong twice a
 * year.
 */
export async function loadStats(supabase: SupabaseClient): Promise<IngestStats> {
  const { data, error } = await supabase.rpc("ingest_daily_stats");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error("ingest_daily_stats failed, falling back to defaults", error);
    return STATS_FALLBACK;
  }
  // `??` would not help here: Number() returns NaN, not null, and queue_buffer
  // is legitimately allowed to be 0, so `||` would silently replace it.
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  // Friday/Saturday in Israel run on the weekend quota.
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date());
  const isWeekend = weekday === "Fri" || weekday === "Sat";
  const weekdayTarget = num(row.daily_target, STATS_FALLBACK.dailyTarget);
  const weekendTarget = num(row.weekend_target, weekdayTarget);
  return {
    publishedToday: num(row.published_today, 0),
    queued: num(row.queued, 0),
    dailyTarget: isWeekend ? weekendTarget : weekdayTarget,
    queueBuffer: num(row.queue_buffer, STATS_FALLBACK.queueBuffer),
    lookbackHours: num(row.lookback_hours, STATS_FALLBACK.lookbackHours),
    categoryCount: num(row.category_count, STATS_FALLBACK.categoryCount),
  };
}

/** Today's progress per active category, ordered by the site's display order. */
export async function loadCategoryStats(supabase: SupabaseClient): Promise<CategoryStat[]> {
  const { data, error } = await supabase.rpc("ingest_category_stats");
  if (error || !Array.isArray(data)) {
    console.error("ingest_category_stats failed", error);
    return [];
  }
  return data.map((row: Record<string, unknown>) => ({
    bucket: String(row.bucket),
    name: String(row.name),
    publishedToday: Number(row.published_today) || 0,
    queued: Number(row.queued) || 0,
  }));
}

/**
 * How many new stories this scan should queue for one category.
 *
 * The queue is topped up toward whatever is still missing from the category's
 * daily target, plus a buffer of spares. The buffer is the whole point: when a
 * story fails on a paywall the worker moves straight to the next queued item
 * instead of the day coming up short. Anything already pending counts against
 * the top-up, so scanning six times a day does not produce six times the
 * articles.
 */
export function topUpCount(
  cat: { publishedToday: number; queued: number },
  dailyTarget: number,
  queueBuffer: number,
  hardCap = 12,
): number {
  const remaining = Math.max(0, dailyTarget - cat.publishedToday);
  if (remaining === 0) return 0;
  const wanted = remaining + queueBuffer - cat.queued;
  return Math.max(0, Math.min(wanted, remaining + queueBuffer, hardCap));
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

// Gemini returns 503 ("model overloaded") and the occasional 500/502/504 as
// transient conditions — a retry after a short pause almost always succeeds.
// 429 also qualifies: the per-minute window resets within seconds.
// 529 is Anthropic's "overloaded", the same idea on the Claude side.
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let resp: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    resp = await fetch(url, init);
    if (resp.ok || !RETRYABLE.has(resp.status)) return resp;
    if (i < attempts - 1) {
      // Drain the failed body so the connection can be reused, then back off.
      await resp.body?.cancel();
      await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
    }
  }
  return resp!;
}

/**
 * callModel, falling back to the lite model when the main one is out of
 * quota — Gemini's free-tier quotas are per model, so the lite bucket is
 * usually still open when flash is exhausted.
 */
/**
 * Claude, speaking the same request/response shape as callModel above, so a
 * caller can swap providers without touching its prompt or its tool schema.
 * Anthropic's Messages API differs in three places, all handled here:
 * the system prompt is a top-level field rather than a message, a tool is
 * {name, description, input_schema} rather than {type, function}, and the
 * answer comes back as a tool_use block rather than a tool_calls array.
 */
const SEP = String.fromCharCode(10, 10);
export async function callClaude(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY חסר");

  const messages = (body.messages as { role: string; content: string }[]) || [];
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join(SEP);
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const tools = ((body.tools as any[]) || []).map((t) => ({
    name: t?.function?.name,
    description: t?.function?.description ?? "",
    input_schema: t?.function?.parameters,
  })).filter((t) => t.name && t.input_schema);

  const wanted = (body.tool_choice as any)?.function?.name;
  const payload: Record<string, unknown> = {
    model: Deno.env.get("CLAUDE_MODEL") || CLAUDE_MODEL,
    max_tokens: Number(body.max_tokens) || 8192,
    messages: rest,
  };
  if (system) payload.system = system;
  if (tools.length) payload.tools = tools;
  if (wanted && tools.some((t) => t.name === wanted)) payload.tool_choice = { type: "tool", name: wanted };
  else if (tools.length) payload.tool_choice = { type: "any" };

  const resp = await fetchWithRetry(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("חריגה ממכסת הבקשות של Claude");
    if (resp.status === 401) throw new Error("מפתח ה-API של Claude נדחה (401)");
    throw new Error(`Claude ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json() as {
    content?: { type: string; name?: string; input?: unknown; text?: string }[];
    stop_reason?: string;
  };

  // Re-shape into the OpenAI envelope that toolArgs() and the plain-text
  // callers already know how to read.
  const block = (data.content || []).find((c) => c.type === "tool_use");
  if (block) {
    if (data.stop_reason === "max_tokens") throw new Error("התשובה של Claude נקטעה (max_tokens)");
    return {
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "claude_tool_call",
            type: "function",
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          }],
        },
      }],
    };
  }
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  if (!text) throw new Error("Claude לא החזיר תשובה");
  return { choices: [{ message: { content: text } }] };
}

/**
 * The resilient path every article-producing call goes through.
 *
 * Order: the main Gemini model → the lighter Gemini models (their free-tier
 * quotas are separate buckets, so one being empty says nothing about the
 * others) → Claude, which is a different vendor entirely and therefore
 * survives a Google-wide outage or a burnt daily quota.
 *
 * Set AI_PRIMARY=claude to put Claude first and Gemini second — one env var
 * to flip the whole system over on a bad Gemini day.
 */
export async function callModelWithFallback(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const claudeFirst = (Deno.env.get("AI_PRIMARY") || "").toLowerCase() === "claude";
  const geminiChain: (() => Promise<Record<string, unknown>>)[] = [
    () => callModel(body),
    ...["gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"].map(
      (model) => () => callModel({ ...body, model }),
    ),
  ];
  const attempts = claudeFirst
    ? [{ name: "claude", run: () => callClaude(body) }, ...geminiChain.map((run, i) => ({ name: `gemini#${i}`, run }))]
    : [...geminiChain.map((run, i) => ({ name: `gemini#${i}`, run })), { name: "claude", run: () => callClaude(body) }];

  const failures: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const result = await attempt.run();
      if (failures.length) console.log(`ספק גיבוי הצליח: ${attempt.name} (אחרי ${failures.join(" | ")})`);
      return result;
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      failures.push(`${attempt.name}: ${msg.slice(0, 120)}`);
      // A malformed request is our bug — no other Gemini model will accept it
      // either. Skip the rest of the Gemini chain and let the other vendor try.
      if (attempt.name.startsWith("gemini") && msg.includes("Gemini 400")) {
        while (i + 1 < attempts.length && attempts[i + 1].name.startsWith("gemini")) i++;
      }
    }
  }
  throw new Error(`כל ספקי ה-AI נכשלו — ${failures.join(" | ")}`);
}

export async function callModel(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY חסר");
  const resp = await fetchWithRetry(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL, ...body }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("חריגה ממכסת הבקשות של Gemini, נסו שוב בעוד רגע");
    if (resp.status === 503) throw new Error("השרתים של Gemini עמוסים כרגע (503), נסו שוב בעוד דקה-שתיים");
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
    const resp = await fetchWithRetry(
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


/**
 * Mirrors a source image into our bucket and returns its public URL.
 *
 * Hotlinking the publisher's CDN would be fragile (expiring URLs, hotlink
 * protection) and leaks reader traffic to a third party; a copy in our storage
 * is stable and stays available even after the source rotates its media.
 */
export async function mirrorImageToBucket(
  supabase: SupabaseClient,
  imageUrl: string,
  timeoutMs = 15000,
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(imageUrl, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Accept": "image/*" },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;

    const mime = (resp.headers.get("content-type") || "").split(";")[0].trim();
    if (!mime.startsWith("image/")) return null;

    const buf = new Uint8Array(await resp.arrayBuffer());
    // Sanity bounds: a lead image under 5KB is a tracking pixel or an icon,
    // and over 8MB is not worth storing for a 16:9 card.
    if (buf.length < 5_000 || buf.length > 8_000_000) return null;

    const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
    const path = `ingest/src-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("article-images")
      .upload(path, buf, { contentType: mime, upsert: false });
    if (error) {
      console.error("image mirror upload failed", error);
      return null;
    }
    return supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("image mirror failed", imageUrl.slice(0, 120), (e as Error).message);
    return null;
  }
}
