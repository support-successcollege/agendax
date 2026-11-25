// deno-lint-ignore-file no-explicit-any
// Quick production ("הפקה מהירה"): from a typed headline to a reviewed draft to
// the site and the social networks, driven by the /quick page.
//
// One function, several small actions, so no single invocation carries the
// whole wait and the page can fill in as each part lands:
//
//   draft        search, read the sources, write the article, save it as a draft
//   review       second model pass: every sentence against the sources
//   teasers      one teaser per network, written by the shared post writer
//   image        cover image (generated, or mirrored from a pasted URL)
//   get / recent reload a production
//   publish      the approved draft goes live and is handed to the publisher
//   status       what each network answered
//   retry_social a failed network, again, with the approved text
//   unpublish    back to draft
//
// Every action requires a logged-in admin. There is deliberately no shared
// secret path here: a scheduled job must not be able to publish through this
// function.
//
// Editorial rules this function enforces in code rather than in prose:
//   - facts come only from sources that were actually read; with none, it
//     refuses to write
//   - a story resting on one source is flagged, and that source is attributed
//     by name in the body (the one exception to the site's no-attribution rule)
//   - the article is signed by the newsroom (the DB trigger sets the byline)
//   - no em dashes, in the article or in the teasers
//   - the approve button is the only way anything reaches the site
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  adminClient,
  callClaude,
  callModelWithFallback,
  corsHeaders,
  enforceInternalLinks,
  FALLBACK_IMAGE,
  fetchArticleText,
  generateGeminiImage,
  htmlToText,
  json,
  mdToArticleHtml,
  mirrorImageToBucket,
  readAlsoHtml,
  relatedLiveArticles,
  resolveCategory,
  toolArgs,
} from "../_shared/ingest.ts";
import {
  auditArticle,
  BODY_MIN_WORDS,
  EXCERPT_MAX,
  EXCERPT_MIN,
  MIN_REVIEW_SCORE,
  MIN_SUBHEADS,
  TITLE_MAX,
  TITLE_MIN,
} from "../_shared/quality.ts";
import { type ArticleForPost, generatePostText, SITE_URL } from "../_shared/social.ts";

const TZ = "Asia/Jerusalem";
const NETWORKS = ["facebook", "instagram", "linkedin"] as const;
type Network = (typeof NETWORKS)[number];

/** Sources older than this are not offered as material for a hot story. */
const SEARCH_WINDOW_HOURS = 48;
/**
 * The second look, taken only when nobody reported the story in the hot
 * window. The page replaced the panel's article generator, which searched a
 * week back; a topic that is a few days old still has to produce an article.
 * Such an article goes to the site alone: its age keeps it off the networks.
 */
const WIDE_SEARCH_WINDOW_HOURS = 168;
/** How many outlets are fetched in full, and how many of those feed the writer. */
const MAX_FETCH = 8;
const MAX_READ = 6;
const SOURCE_CHARS = 9000;
/** Same fallback social-publish uses when ingest_config cannot be read. */
const DEFAULT_MAX_STORY_AGE_HOURS = 36;
const LINKEDIN_DAILY_CAP = 5;
/** A run of this many identical words in a row is lifted text, not coincidence. */
const OVERLAP_WORDS = 9;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** House style: no em or en dashes anywhere a reader can see. */
const noLongDashes = (s: string): string => (s || "").replace(/[\u2014\u2013]/g, "-");

const israelDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const israelToday = (): string =>
  new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

async function timedFetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, "Accept": "application/rss+xml,application/xml,text/xml,*/*", "Accept-Language": "he,en;q=0.8" },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      await resp.body?.cancel();
      // A search engine that refuses a datacenter address answers 4xx or 5xx.
      // Without this line an empty search looks the same as a quiet news day.
      console.error("quick-article: feed refused", hostOf(url), resp.status);
      return null;
    }
    return (await resp.text()).slice(0, 800_000);
  } catch (e) {
    console.error("quick-article: feed fetch failed", hostOf(url), (e as Error).message);
    return null;
  }
}

/** Claude writes and reviews; the Gemini chain is the fallback, not the default. */
async function claudeFirst(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await callClaude(body);
  } catch (e) {
    console.error("quick-article: Claude failed, falling back", (e as Error).message);
    return await callModelWithFallback(body);
  }
}

/**
 * The closing "למה זה חשוב לך" section gets its branded box, the same way the
 * ingest worker wraps it, so a quick article renders like every other one.
 */
function wrapWhyItMatters(html: string): string {
  const m = html.match(/<h2[^>]*>\s*למה זה חשוב/);
  if (!m || m.index === undefined) return html;
  return html.slice(0, m.index) + `<div class="why-it-matters">` + html.slice(m.index) + `</div>`;
}

const articleUrl = (network: Network | "whatsapp", slug: string): string =>
  // Facebook and Instagram render the raw Hebrew slug; LinkedIn's URL detector
  // stops at the first non-Latin character, so it gets the encoded form. The
  // same split social-publish makes.
  network === "linkedin" ? `${SITE_URL}/article/${encodeURIComponent(slug)}` : `${SITE_URL}/article/${slug}`;

/**
 * A teaser was written against the draft's slug; the slug may have changed
 * since. Only the address is replaced: punctuation that happens to follow it
 * in the sentence stays where the editor put it.
 */
const withFinalUrl = (text: string, url: string): string =>
  text.replace(/https?:\/\/(?:www\.)?agendax\.co\.il\/article\/[^\s)\]"'<>,;!?]+/gi, (match) => {
    const trailing = /[.:]+$/.exec(match)?.[0] ?? "";
    return url + trailing;
  });

/**
 * A pasted address is fetched from our server, so it has to be an ordinary
 * public web address: a name, not a bare IP, not localhost, not an internal
 * suffix. This is a first line only; it does not follow DNS or redirects.
 */
function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || host.startsWith("[")) return false;
    if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** What was reviewed, as one fingerprint: the review belongs to this text and no other. */
async function textHash(title: string, excerpt: string, content: string): Promise<string> {
  const text = [
    noLongDashes(title.trim()).slice(0, 300),
    noLongDashes(excerpt.trim()).slice(0, 400),
    noLongDashes(content),
  ].join("\n\u0000\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A network's error text can quote the request it failed on; no token may ride along to the page. */
const redact = (s: string | null | undefined): string | null =>
  s
    ? s
      .replace(/((?:access_)?token|key|secret|signature)=[^&\s"']+/gi, "$1=***")
      .replace(/\bEA[A-Za-z0-9]{30,}\b/g, "***")
    : null;

// ---------------------------------------------------------------------------
// Auth: a logged-in admin, nothing else
// ---------------------------------------------------------------------------

async function requireAdmin(req: Request): Promise<{ userId: string; authHeader: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.claims.sub, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden: admin role required" }, 403);
  return { userId: String(data.claims.sub), authHeader };
}

// ---------------------------------------------------------------------------
// Context: what the page must show before the editor approves
// ---------------------------------------------------------------------------

/** The next scheduled site build (03, 07, 11, 15, 19, 23 UTC), as an ISO time. */
function nextBuildAt(now = new Date()): string {
  const hours = [3, 7, 11, 15, 19, 23];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let day = 0; day < 2; day++) {
    for (const h of hours) {
      const at = new Date(d.getTime() + day * 86_400_000 + h * 3_600_000);
      if (at.getTime() > now.getTime()) return at.toISOString();
    }
  }
  return new Date(now.getTime() + 4 * 3_600_000).toISOString();
}

async function loadContext(supabase: any) {
  const [{ data: cfg }, { data: settings }, { data: accounts }, { data: recent }] = await Promise.all([
    supabase.from("ingest_config").select("max_story_age_hours").limit(1).maybeSingle(),
    supabase.from("social_settings").select("*").eq("id", 1).maybeSingle(),
    // Never the credentials column: only which networks are switched on.
    supabase.from("social_accounts").select("platform, enabled").eq("enabled", true),
    supabase
      .from("social_posts")
      .select("created_at")
      .eq("platform", "linkedin")
      .eq("status", "posted")
      .gte("created_at", new Date(Date.now() - 26 * 3_600_000).toISOString()),
  ]);

  const hours = Number(cfg?.max_story_age_hours);
  const rawCap = settings?.linkedin_daily_cap;
  const cap = rawCap === null || rawCap === undefined ? LINKEDIN_DAILY_CAP : Number(rawCap);
  const today = israelDate(new Date());
  const postedToday = ((recent ?? []) as { created_at: string }[])
    .filter((r) => israelDate(new Date(r.created_at)) === today).length;

  return {
    maxStoryAgeHours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_MAX_STORY_AGE_HOURS,
    enabledPlatforms: ((accounts ?? []) as { platform: string }[])
      .map((a) => a.platform)
      .filter((p): p is Network => (NETWORKS as readonly string[]).includes(p)),
    dmAutomation: settings?.dm_automation ?? false,
    linkedinLinkInComment: settings?.linkedin_link_in_comment ?? true,
    linkedin: { postedToday, cap, full: cap > 0 && postedToday >= cap },
    limits: {
      titleMin: TITLE_MIN,
      titleMax: TITLE_MAX,
      excerptMin: EXCERPT_MIN,
      excerptMax: EXCERPT_MAX,
      bodyMinWords: BODY_MIN_WORDS,
      minSubheads: MIN_SUBHEADS,
      minReviewScore: MIN_REVIEW_SCORE,
      stockImage: FALLBACK_IMAGE,
    },
    nextBuildAt: nextBuildAt(),
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
//
// Three places, no new service and no new key:
//   - Google News RSS, Hebrew and English: who is reporting the story and when.
//     Its links do not lead to the publisher (they open a Google page that
//     needs JavaScript), so a Google item on its own is a headline, never
//     material.
//   - Bing News RSS, Hebrew and English: carries the publisher's own URL, so
//     these can be read in full.
//   - ingest_scan_buffer: what our own scanners saw in the last hours, also
//     with direct URLs.
// Links the editor pasted come first and are always read.

type Origin = "pasted" | "google_news" | "bing_news" | "buffer";

type Candidate = {
  outlet: string;
  domain: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  origin: Origin;
};

type Source = Candidate & { read: boolean; note?: string };

type ReadSource = Source & { text: string };

function toIso(raw: string): string | null {
  const t = Date.parse(raw || "");
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function parseNewsRss(xml: string, origin: "google_news" | "bing_news"): Candidate[] {
  const out: Candidate[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const tag = (name: string) => {
      const r = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
      return r ? decodeEntities(r[1]) : "";
    };
    let title = tag("title");
    const link = tag("link");
    const publishedAt = toIso(tag("pubDate"));
    if (!title || !link) continue;

    if (origin === "google_news") {
      const src = /<source[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i.exec(block);
      const outlet = src ? decodeEntities(src[2]) : "";
      const domain = src ? hostOf(src[1]) : "";
      if (!outlet || !domain) continue;
      // Google appends " - Outlet" to every headline.
      if (title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3)).trim();
      out.push({ outlet, domain, title, url: null, publishedAt, origin });
    } else {
      // Bing wraps the publisher's URL in a redirect; the real one is in ?url=.
      let direct = "";
      try {
        direct = new URL(link).searchParams.get("url") || "";
      } catch { /* not a URL */ }
      if (!/^https?:\/\//i.test(direct)) continue;
      const host = hostOf(direct);
      let outlet = tag("News:Source") || host;
      // An MSN copy is a syndication of someone else's story: the outlet is the
      // original publisher, and MSN must not collapse five outlets into one.
      const viaMsn = host.endsWith("msn.com");
      if (viaMsn) outlet = outlet.replace(/\s+on MSN$/i, "").trim();
      const domain = viaMsn ? `msn:${outlet.toLowerCase()}` : host;
      out.push({ outlet, domain, title, url: direct, publishedAt, origin });
    }
  }
  return out;
}

/** PostgREST's or() syntax breaks on commas, dots and brackets inside a value. */
const safeKeyword = (k: string): string => k.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();

type Entity = { he: string; en: string };
type Queries = { he: string; en: string; entities: Entity[] };

/**
 * Search strings plus the story's distinguishing names, each in both
 * spellings. A headline "mentions" an entity when either spelling appears, so
 * a Hebrew headline and an English one about the same company count the same.
 */
async function searchQueries(title: string): Promise<Queries> {
  const fallback: Entity[] = title
    .split(/\s+/)
    .map(safeKeyword)
    .filter((w) => w.length >= 3)
    .slice(0, 3)
    .map((w) => ({ he: w, en: w }));
  try {
    // Claude first, like the writer: when the Gemini quota is spent, the
    // fallback chain burns half a minute before it reaches Claude, on a page
    // whose whole point is speed.
    const data = await claudeFirst({
      messages: [
        {
          role: "system",
          content:
            "קיבלת כותרת של ידיעה חמה. החזר דרך הכלי search_queries: מחרוזת חיפוש קצרה בעברית (3-6 מילים), מחרוזת חיפוש קצרה באנגלית (3-6 מילים), " +
            "ו-1 עד 3 ישויות מבחינות (חברה, אדם, מוצר), כל אחת באיות העברי ובאיות האנגלי כפי שיופיעו בכותרות. בלי מילים כלליות.",
        },
        { role: "user", content: title },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "search_queries",
            description: "מחרוזות חיפוש וישויות מבחינות לידיעה",
            parameters: {
              type: "object",
              properties: {
                he: { type: "string" },
                en: { type: "string" },
                entities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { he: { type: "string" }, en: { type: "string" } },
                    required: ["he", "en"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["he", "en", "entities"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "search_queries" } },
    });
    const args = toolArgs(data) as { he?: string; en?: string; entities?: Entity[] };
    const entities = (args.entities || [])
      .map((e) => ({ he: safeKeyword(String(e?.he ?? "")), en: safeKeyword(String(e?.en ?? "")) }))
      .filter((e) => e.he.length >= 2 || e.en.length >= 2)
      .slice(0, 3);
    return {
      he: (args.he || title).replace(/["']/g, "").slice(0, 120),
      en: (args.en || title).replace(/["']/g, "").slice(0, 120),
      entities: entities.length ? entities : fallback,
    };
  } catch (e) {
    console.error("quick-article: query extraction failed", (e as Error).message);
    return { he: title, en: title, entities: fallback };
  }
}

/** How many of the story's entities the headline names, in either spelling. */
function mentions(title: string, entities: Entity[]): number {
  const t = title.toLowerCase();
  return entities.filter((e) =>
    [e.he, e.en].some((form) => form.length >= 2 && t.includes(form.toLowerCase()))
  ).length;
}

const spellings = (entities: Entity[]): string[] =>
  [...new Set(entities.flatMap((e) => [e.he, e.en]).filter((k) => k.length >= 2))];

async function findCandidates(
  supabase: any,
  queries: Queries,
  windowHours: number = SEARCH_WINDOW_HOURS,
  /** Entities a search-engine headline has to name. The wide look asks for more. */
  minHits = 1,
): Promise<Candidate[]> {
  const q = (s: string) => encodeURIComponent(s);
  const when = `when:${Math.max(1, Math.round(windowHours / 24))}d`;
  const feeds: { url: string; origin: "google_news" | "bing_news" }[] = [
    { url: `https://news.google.com/rss/search?q=${q(`${queries.he} ${when}`)}&hl=he&gl=IL&ceid=IL:he`, origin: "google_news" },
    { url: `https://news.google.com/rss/search?q=${q(`${queries.en} ${when}`)}&hl=en-US&gl=US&ceid=US:en`, origin: "google_news" },
    { url: `https://www.bing.com/news/search?q=${q(queries.he)}&format=rss&setlang=he&cc=IL`, origin: "bing_news" },
    { url: `https://www.bing.com/news/search?q=${q(queries.en)}&format=rss&setlang=en&cc=US`, origin: "bing_news" },
  ];

  const bufferSearch = async (): Promise<Candidate[]> => {
    const keys = spellings(queries.entities);
    if (keys.length === 0) return [];
    const { data, error } = await supabase
      .from("ingest_scan_buffer")
      .select("url, title, source_name, item_published_at")
      .or(keys.map((k) => `title.ilike.%${k}%`).join(","))
      .order("item_published_at", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) {
      console.error("quick-article: buffer search failed", error.message);
      return [];
    }
    return ((data ?? []) as { url: string; title: string; source_name: string; item_published_at: string | null }[])
      .map((r) => ({
        // Feed titles are stored as the feed sent them, entities and all.
        outlet: decodeEntities(r.source_name || ""),
        domain: hostOf(r.url),
        title: decodeEntities(r.title || ""),
        url: r.url,
        publishedAt: r.item_published_at,
        origin: "buffer" as const,
      }))
      .filter((c) => c.domain);
  };

  const [fromFeeds, fromBuffer] = await Promise.all([
    Promise.all(feeds.map(async (f) => {
      const xml = await timedFetchText(f.url);
      return xml ? parseNewsRss(xml, f.origin) : [];
    })),
    bufferSearch(),
  ]);

  const cutoff = Date.now() - windowHours * 3_600_000;
  // A search engine returns loosely related items too. One entity in the
  // headline is the floor; the buffer, which was matched on any spelling at
  // all, has to name two entities when the story has two.
  const need = Math.min(2, queries.entities.length);
  const floor = Math.min(Math.max(1, minHits), Math.max(1, queries.entities.length));
  const kept = [...fromFeeds.flat(), ...fromBuffer]
    .filter((c) => !c.publishedAt || Date.parse(c.publishedAt) >= cutoff)
    .filter((c) => {
      if (queries.entities.length === 0) return true;
      const hits = mentions(c.title, queries.entities);
      return c.origin === "buffer" ? hits >= need : hits >= floor;
    });
  // One line per search: which engine answered, and how much survived. Counts
  // only, no headline text.
  console.log(
    "quick-article: search",
    JSON.stringify({
      windowHours,
      feeds: fromFeeds.map((items, i) => `${feeds[i].origin}:${items.length}`),
      buffer: fromBuffer.length,
      kept: kept.length,
      readable: kept.filter((c) => c.url).length,
    }),
  );
  return kept;
}

/**
 * One row per outlet. A readable URL beats a headline; among equals the newer
 * report wins. Pasted links are placed first and never displaced.
 */
function byOutlet(pasted: Candidate[], found: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of found) {
    const cur = best.get(c.domain);
    const better =
      !cur ||
      (!!c.url && !cur.url) ||
      (!!c.url === !!cur.url && (c.publishedAt || "") > (cur.publishedAt || ""));
    if (better) best.set(c.domain, c);
  }
  for (const p of pasted) best.delete(p.domain);
  const rest = [...best.values()].sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return [...pasted, ...rest];
}

async function readSources(outlets: Candidate[]): Promise<{ sources: Source[]; read: ReadSource[] }> {
  const readable = outlets.filter((o) => o.url).slice(0, MAX_FETCH);
  const fetched = await Promise.all(
    readable.map(async (o) => ({ o, page: await fetchArticleText(o.url!, 12000, SOURCE_CHARS) })),
  );
  const read: ReadSource[] = [];
  const notes = new Map<string, string>();
  for (const { o, page } of fetched) {
    if (!page) {
      notes.set(o.domain, "לא נפתח (חסימה או מנוי)");
      continue;
    }
    // A link the editor chose is trusted further than one a search returned.
    const usable = page.check.ok || (o.origin === "pasted" && page.text.length >= 600);
    if (!usable) {
      notes.set(o.domain, "אין גוף כתבה קריא בדף");
      continue;
    }
    if (read.length >= MAX_READ) {
      notes.set(o.domain, "מעבר למכסת המקורות לקריאה");
      continue;
    }
    read.push({
      ...o,
      url: page.url || o.url,
      read: true,
      text: page.text,
      ...(page.check.ok ? {} : { note: "נקרא, אבל הדף נראה חלקי (ייתכן חומת תשלום). לבדוק מול המקור." }),
    });
  }
  const sources: Source[] = outlets.slice(0, 16).map((o) => {
    const hit = read.find((r) => r.domain === o.domain);
    if (hit) {
      return {
        outlet: hit.outlet,
        domain: hit.domain,
        title: hit.title,
        url: hit.url,
        publishedAt: hit.publishedAt,
        origin: hit.origin,
        read: true,
        ...(hit.note ? { note: hit.note } : {}),
      };
    }
    return {
      ...o,
      read: false,
      note: notes.get(o.domain) ?? (o.url ? "לא נקרא" : "כותרת בלבד, בלי קישור ישיר"),
    };
  });
  // A read source past the display cap must still be listed.
  for (const r of read) {
    if (!sources.some((s) => s.domain === r.domain)) {
      sources.push({
        outlet: r.outlet,
        domain: r.domain,
        title: r.title,
        url: r.url,
        publishedAt: r.publishedAt,
        origin: r.origin,
        read: true,
        ...(r.note ? { note: r.note } : {}),
      });
    }
  }
  return { sources, read };
}

// ---------------------------------------------------------------------------
// Copy check: wording lifted from a source
// ---------------------------------------------------------------------------

const words = (s: string): string[] =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

function findOverlaps(bodyText: string, read: ReadSource[]): { outlet: string; snippet: string }[] {
  const body = words(bodyText);
  const out: { outlet: string; snippet: string }[] = [];
  for (const src of read) {
    const sw = words(src.text);
    if (sw.length < OVERLAP_WORDS) continue;
    const grams = new Set<string>();
    for (let i = 0; i + OVERLAP_WORDS <= sw.length; i++) grams.add(sw.slice(i, i + OVERLAP_WORDS).join(" "));
    let i = 0;
    while (i + OVERLAP_WORDS <= body.length) {
      if (!grams.has(body.slice(i, i + OVERLAP_WORDS).join(" "))) {
        i++;
        continue;
      }
      let end = i + OVERLAP_WORDS;
      while (end < body.length && grams.has(body.slice(end - OVERLAP_WORDS + 1, end + 1).join(" "))) end++;
      out.push({ outlet: src.outlet, snippet: body.slice(i, end).join(" ").slice(0, 240) });
      i = end;
      if (out.length >= 6) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const LINK_RULES = `

קישורים פנימיים:
- בסוף החומר יש רשימה "כתבות שכבר באתר". שלב קישור אחד אליהן רק אם יש קשר ענייני אמיתי (אותה חברה, אותו מוצר, המשך של אותו סיפור). אם אין קשר כזה, אל תקשר.
- קישור נכתב במרקדאון [ביטוי](/article/slug) על ביטוי טבעי שכבר קיים במשפט. לא בפסקה הראשונה ולא בכותרות.
- רק כתובות מהרשימה, אות באות. אסור לקשר לאתרים חיצוניים.`;

function writerSystem(opts: { categoryNames: string; singleOutlet: string | null; hasLinks: boolean }): string {
  const attribution = opts.singleOutlet
    ? `- **מקור יחיד.** כל החומר שנקרא מגיע מכלי תקשורת אחד: ${opts.singleOutlet}. ייחס לו את הדיווח בשמו כבר בפסקה הראשונה ("לפי דיווח של ${opts.singleOutlet}"), וכתוב בלשון זהירה: מה שהמקור מציג כהערכה, כשמועה או כדברי מקורות עלומים, נשאר כזה גם אצלך. אל תציג אותו כעובדה מוגמרת.`
    : `- **ייחוס.** אם המקורות שקראת מדווחים באופן עצמאי, אל תזכיר כלי תקשורת בגוף הכתבה וכתוב את העובדות ישירות. אם כולם נשענים על אותו דיווח מקורי של כלי תקשורת אחד, סמן single_origin=true, כתוב את שמו ב-origin_outlet, ייחס לו את הדיווח בשמו בפסקה הראשונה ("לפי דיווח של ..."), וכתוב בלשון זהירה.`;

  return `היום ${israelToday()}. אתה כתב חדשות באתר ישראלי בעברית שמסקר הייטק, בינה מלאכותית, שוקי הון וחברות. הגיעה ידיעה חמה, ואתה כותב עליה כתבה קצרה ומהירה לפרסום מיידי.

כללי ברזל:
- **עובדות מהמקורות בלבד.** כל שם, מספר, תאריך, סכום ותפקיד חייבים להופיע במקורות שתחת "מקורות שנקראו". אל תשלים דבר מהידע הכללי שלך. נתון חסר פשוט לא מוזכר.
- **בלי העתקה.** נסח הכול מחדש במילים שלך ובמבנה שלך. ציטוט במירכאות חייב להופיע מילה במילה במקור, ומיוחס לאדם או לחברה שאמרו אותו. בלי ציטוט מדויק, כתוב משפט תיאורי בלי מירכאות.
${attribution}
- **סתירות.** אם המקורות סותרים זה את זה, כתוב את שתי הגרסאות. אל תבחר אחת.
- **בלי מקף ארוך.** רק מקף רגיל (-). תאריכים בפורמט DD/MM/YYYY.
- שפה עניינית, בלי דעות, בלי סופרלטיבים ובלי כותרת שמבטיחה יותר ממה שהכתבה נותנת.

מבנה:
- פסקת פתיחה: מה קרה, מי, מתי.
- **${BODY_MIN_WORDS + 30}-520 מילים** בגוף הכתבה. את האורך ממלאים ברקע ובהקשר שמופיעים במקורות עצמם, לא בניסוחים כלליים. אם החומר לא מספיק לאורך הזה, כתוב קצר יותר ואל תרפד.
- **שתי כותרות משנה ענייניות** במרקדאון (## כותרת).
- **סקשן סיום**: ## למה זה חשוב לך - 2-4 משפטים על המשמעות המעשית של ההתפתחות, נשענים רק על מה שכתוב במקורות. בלי להמציא זווית ישראלית שאין לה בסיס.
- מרקדאון נקי בשדה body, בלי code fences ובלי כותרת H1.${opts.hasLinks ? LINK_RULES : ""}

שדות נוספים:
- title: כותרת חדה בעברית באורך **${TITLE_MIN}-${TITLE_MAX} תווים כולל רווחים**. ספור.
- subtitle: תקציר של משפט או שניים באורך **${EXCERPT_MIN}-${EXCERPT_MAX} תווים כולל רווחים**. ספור.
- category: אחת מ: ${opts.categoryNames}.
- image_prompt: פרומפט באנגלית לאיור עריכתי מופשט או לסצנה גנרית שמלווה את הנושא. בלי אנשים אמיתיים, בלי פרצופים מזוהים, בלי לוגואים, בלי טקסט, ובלי הדמיה של האירוע עצמו.
- key_facts: 3-5 עובדות מפתח קצרות, כל אחת מהמקורות.
- confidence: 1-10, כמה המקורות הספיקו לכתבה מדויקת.
- single_origin, origin_outlet: לפי כלל הייחוס.

החזר רק דרך הכלי write_quick_article.`;
}

type Written = {
  title: string;
  subtitle: string;
  body: string;
  category: string;
  image_prompt: string;
  key_facts: string[];
  confidence: number;
  single_origin?: boolean;
  origin_outlet?: string;
};

async function fitLengths(title: string, subtitle: string): Promise<{ title: string; subtitle: string }> {
  const titleOk = title.length >= TITLE_MIN && title.length <= TITLE_MAX;
  const subOk = subtitle.length >= EXCERPT_MIN && subtitle.length <= EXCERPT_MAX;
  if (titleOk && subOk) return { title, subtitle };
  try {
    const data = await callModelWithFallback({
      messages: [
        {
          role: "system",
          content:
            `תקן אורכים בלי לשנות עובדות ובלי להוסיף מידע. כותרת: ${TITLE_MIN}-${TITLE_MAX} תווים כולל רווחים. ` +
            `תקציר: ${EXCERPT_MIN}-${EXCERPT_MAX} תווים כולל רווחים. בלי מקף ארוך. החזר את שניהם דרך הכלי fit, גם את מה שכבר תקין.`,
        },
        {
          role: "user",
          content: `כותרת (${title.length} תווים): ${title}\n\nתקציר (${subtitle.length} תווים): ${subtitle}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "fit",
            description: "כותרת ותקציר באורך הנדרש",
            parameters: {
              type: "object",
              properties: { title: { type: "string" }, subtitle: { type: "string" } },
              required: ["title", "subtitle"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "fit" } },
    });
    const fixed = toolArgs(data) as { title?: string; subtitle?: string };
    const t = noLongDashes(String(fixed.title || "").trim());
    const s = noLongDashes(String(fixed.subtitle || "").trim());
    return {
      // Only take a fix that actually lands inside the range.
      title: !titleOk && t.length >= TITLE_MIN && t.length <= TITLE_MAX ? t : title,
      subtitle: !subOk && s.length >= EXCERPT_MIN && s.length <= EXCERPT_MAX ? s : subtitle,
    };
  } catch (e) {
    console.error("quick-article: fitLengths failed", (e as Error).message);
    return { title, subtitle };
  }
}

// ---------------------------------------------------------------------------
// Shaping what the page receives
// ---------------------------------------------------------------------------

const ARTICLE_COLS =
  "id, slug, title, excerpt, content, category, category_slug, image_url, is_draft, is_breaking, published_at, updated_at, source_url, source_name, source_published_at, review_score, review_note";

function shapeArticle(a: any) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    content: a.content,
    category: a.category,
    imageUrl: a.image_url,
    isDraft: a.is_draft,
    isBreaking: !!a.is_breaking,
    publishedAt: a.published_at,
    // Passed back verbatim on publish; never parsed into a Date on the way,
    // because JavaScript would drop the microseconds and the guard would fail.
    updatedAt: a.updated_at,
    sourceUrl: a.source_url,
    sourcePublishedAt: a.source_published_at,
    reviewScore: a.review_score,
    reviewNote: a.review_note,
  };
}

async function shapeProduction(supabase: any, prod: any) {
  const [{ data: article }, context] = await Promise.all([
    prod.article_id
      ? supabase.from("articles").select(ARTICLE_COLS).eq("id", prod.article_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadContext(supabase),
  ]);
  const sources = (prod.sources ?? []) as Source[];
  const read = sources.filter((s) => s.read);
  return {
    productionId: prod.id,
    status: prod.status,
    origin: prod.origin,
    requestedTitle: prod.requested_title,
    createdAt: prod.created_at,
    article: article ? shapeArticle(article) : null,
    sources,
    outletsCount: prod.outlets_count,
    readCount: read.length,
    singleSource: !!prod.single_source,
    singleSourceNote: prod.single_source_note,
    // No source carried a publication time: the age shown is a guess.
    ageUnknown: read.length > 0 && read.every((s) => !s.publishedAt),
    unsupported: prod.unsupported ?? [],
    overlaps: prod.overlaps ?? [],
    teasers: prod.teasers ?? {},
    approvedTeasers: prod.approved_teasers ?? {},
    platforms: prod.platforms ?? [],
    results: prod.results ?? null,
    error: prod.error,
    context,
  };
}

async function loadProduction(supabase: any, id: unknown): Promise<any | null> {
  const productionId = String(id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(productionId)) return null;
  const { data } = await supabase.from("quick_productions").select("*").eq("id", productionId).maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Live stories from the last three days whose headline names the same
 * entities: the editor should know before publishing a second article on the
 * same event. A light query, headlines only.
 */
async function alreadyOnSite(
  supabase: any,
  entities: Entity[],
  excludeId: string,
): Promise<{ title: string; slug: string; publishedAt: string | null }[]> {
  const keys = spellings(entities);
  if (keys.length === 0) return [];
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, slug, published_at")
    .eq("is_draft", false)
    .gte("published_at", new Date(Date.now() - 72 * 3_600_000).toISOString())
    .or(keys.map((k) => `title.ilike.%${k}%`).join(","))
    .order("published_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("quick-article: coverage check failed", error.message);
    return [];
  }
  const need = Math.min(2, entities.length);
  return ((data ?? []) as { id: string; title: string; slug: string; published_at: string | null }[])
    .filter((a) => a.id !== excludeId && mentions(a.title, entities) >= need)
    .slice(0, 5)
    .map((a) => ({ title: a.title, slug: a.slug, publishedAt: a.published_at }));
}

async function actionDraft(supabase: any, body: any, userId: string): Promise<Response> {
  const requested = String(body?.title ?? "").trim().slice(0, 300);
  const pastedUrls: string[] = [
    ...new Set<string>(
      (Array.isArray(body?.sourceUrls) ? body.sourceUrls : [])
        .map((u: unknown) => String(u ?? "").trim())
        .filter((u: string) => /^https?:\/\/\S+$/i.test(u) && isPublicHttpUrl(u)),
    ),
  ].slice(0, 6);
  if (requested.length < 5 && pastedUrls.length === 0) {
    return json({ error: "כתבו כותרת לידיעה, או הדביקו קישור למקור" }, 400);
  }

  const { data: prod, error: prodErr } = await supabase
    .from("quick_productions")
    .insert({
      requested_title: requested || pastedUrls[0],
      pasted_urls: pastedUrls,
      origin: "manual",
      status: "drafting",
      created_by: userId,
    })
    .select("id")
    .single();
  if (prodErr || !prod) return json({ error: `פתיחת ההפקה נכשלה: ${prodErr?.message ?? ""}` }, 500);

  // Set once the draft row exists, so a failure after that point still leaves
  // the trail pointing at it.
  let draftId: string | null = null;
  const fail = async (message: string, status: number, extra: Record<string, unknown> = {}) => {
    await supabase
      .from("quick_productions")
      .update({ status: "failed", error: message.slice(0, 500), ...(draftId ? { article_id: draftId } : {}), ...extra })
      .eq("id", prod.id);
    return json({ error: message }, status);
  };

  try {
    // --- 1. Search --------------------------------------------------------
    const queries = requested.length >= 5
      ? await searchQueries(requested)
      : { he: "", en: "", entities: [] as Entity[] };
    const pasted: Candidate[] = pastedUrls.map((u) => ({
      outlet: hostOf(u),
      domain: hostOf(u),
      title: u,
      url: u,
      publishedAt: null,
      origin: "pasted" as const,
    }));
    let found = requested.length >= 5 ? await findCandidates(supabase, queries) : [];
    let { sources, read } = await readSources(byOutlet(pasted, found));

    // Nothing readable in the hot window: look a week back. An older article
    // that merely names the same company is likely a different story, so on
    // this pass a headline has to name two of the story's entities when the
    // story has two.
    if (read.length === 0 && requested.length >= 5) {
      found = await findCandidates(supabase, queries, WIDE_SEARCH_WINDOW_HOURS, 2);
      ({ sources, read } = await readSources(byOutlet(pasted, found)));
    }

    // No readable source: refuse rather than write from headlines. A model
    // handed five headlines and no article will invent the article.
    if (read.length === 0) {
      const headlines = sources.length;
      return await fail(
        headlines > 0
          ? `נמצאו ${headlines} כותרות על הנושא, אבל אף מקור לא נקרא במלואו. הדביקו קישור ישיר לכתבה אחת לפחות.`
          : "לא נמצא דיווח על הנושא ב-7 הימים האחרונות. נסחו את הכותרת אחרת, או הדביקו קישור למקור.",
        422,
        { sources, outlets_count: sources.length },
      );
    }

    const readOutlets = new Set(read.map((r) => r.domain));
    const singleRead = readOutlets.size === 1 ? read[0].outlet : null;

    // --- 2. Material -------------------------------------------------------
    const research =
      `=== מקורות שנקראו ===\n\n` +
      read
        .map((r, i) =>
          `### מקור ${i + 1}: ${r.outlet}\nכותרת: ${r.title}\nכתובת: ${r.url}\n` +
          (r.publishedAt ? `פורסם: ${r.publishedAt}\n` : "") +
          `\n${r.text}`
        )
        .join("\n\n---\n\n");
    // Headlines of sources that were not read stay out of the material
    // altogether: a model that sees a headline can lift a fact from it.

    const { data: liveCategories } = await supabase
      .from("categories")
      .select("name")
      .eq("is_active", true)
      .neq("slug", "home");
    const categoryNames = ((liveCategories ?? []) as { name: string }[]).map((c) => c.name).join(", ") || "הייטק";

    // The freshest live stories, as link targets. popular: 0 keeps this off
    // the page_views table.
    const linkCandidates = await relatedLiveArticles(supabase, { sameCategory: 5, popular: 0 });
    const linksBlock = linkCandidates.length
      ? `\n\n=== כתבות שכבר באתר (מועמדות לקישור פנימי) ===\n` +
        linkCandidates.map((c) => `- כותרת: ${c.title}\n  כתובת: /article/${c.slug}`).join("\n")
      : "";

    // --- 3. Write ----------------------------------------------------------
    const response = await claudeFirst({
      messages: [
        { role: "system", content: writerSystem({ categoryNames, singleOutlet: singleRead, hasLinks: linkCandidates.length > 0 }) },
        {
          role: "user",
          content: (requested ? `הכותרת שהעורך ביקש: ${requested}\n\n` : "") + research + linksBlock,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "write_quick_article",
            description: "כתבה מהירה בעברית, מבוססת רק על המקורות שנקראו",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                body: { type: "string", description: "מרקדאון GFM" },
                category: { type: "string" },
                image_prompt: { type: "string" },
                key_facts: { type: "array", items: { type: "string" } },
                confidence: { type: "integer" },
                single_origin: { type: "boolean", description: "כל המקורות נשענים על אותו דיווח מקורי" },
                origin_outlet: { type: "string", description: "שם כלי התקשורת המקורי, או ריק" },
              },
              required: ["title", "subtitle", "body", "category", "image_prompt", "key_facts", "confidence", "single_origin", "origin_outlet"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "write_quick_article" } },
    });
    const written = toolArgs(response) as Written;

    if (!written.title || !written.body || written.body.length < 400) {
      return await fail("המודל החזיר כתבה ריקה או קצרה מדי. נסו שוב.", 502, { sources, outlets_count: sources.length });
    }
    // A missing or non-numeric value fails the gate too.
    if (!(Number(written.confidence) > 3)) {
      return await fail(
        `המקורות שנמצאו דלים מדי לכתבה אמינה (ביטחון ${written.confidence}/10). הדביקו קישור נוסף או נסחו את הכותרת אחרת.`,
        422,
        { sources, outlets_count: sources.length },
      );
    }

    const fitted = await fitLengths(noLongDashes(written.title.trim()), noLongDashes((written.subtitle || "").trim()));
    const bodyMd = noLongDashes(written.body);
    const bodyHtml = enforceInternalLinks(mdToArticleHtml(bodyMd), linkCandidates);
    const content = wrapWhyItMatters(bodyHtml) + readAlsoHtml(linkCandidates, bodyHtml);

    // --- 4. Single source --------------------------------------------------
    const originOutlet = String(written.origin_outlet || "").trim();
    const singleSource = !!singleRead || !!written.single_origin;
    const others = sources.length - readOutlets.size;
    const singleSourceNote = singleRead
      ? `נקרא מקור אחד בלבד: ${singleRead}.` + (others > 0 ? ` ${others} כלים נוספים מדווחים, אבל רק כותרת.` : "")
      : written.single_origin
        ? `כל המקורות שנקראו מצטטים את אותו דיווח${originOutlet ? `: ${originOutlet}` : ""}.`
        : null;

    // --- 5. Save as a draft ------------------------------------------------
    const { category, category_slug } = await resolveCategory(supabase, written.category);
    const primary = read[0];
    const newest = read.map((r) => r.publishedAt).filter(Boolean).sort().pop() ?? null;

    const { data: inserted, error: insertErr } = await supabase
      .from("articles")
      .insert({
        title: fitted.title.slice(0, 300),
        excerpt: fitted.subtitle.slice(0, 400),
        content,
        category,
        category_slug,
        // The cover arrives in its own action, so the text is on screen first.
        image_url: FALLBACK_IMAGE,
        author: "חדשות AgendaX",
        author_slug: "agendax",
        is_draft: true,
        scheduled_at: null,
        is_breaking: false,
        is_featured: false,
        source_url: primary.url,
        source_name: primary.outlet,
        // The newest source read. With no time on any source, the story is
        // dated now and the page says its age is unknown.
        source_published_at: newest ?? new Date().toISOString(),
        source_links: read.map((r) => ({ title: `${r.outlet}: ${r.title}`, url: r.url })),
        review_score: null,
        review_note: singleSource ? "הפקה מהירה. מקור יחיד." : "הפקה מהירה.",
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return await fail(`שמירת הטיוטה נכשלה: ${insertErr?.message ?? ""}`, 500, { sources, outlets_count: sources.length });
    }
    draftId = inserted.id;

    const overlaps = findOverlaps(htmlToText(content), read);
    const { data: saved } = await supabase
      .from("quick_productions")
      .update({
        status: "ready",
        article_id: inserted.id,
        sources,
        outlets_count: sources.length,
        single_source: singleSource,
        single_source_note: singleSourceNote,
        research: research.slice(0, 70_000),
        overlaps,
        image_prompt: String(written.image_prompt || "").slice(0, 1000),
        error: null,
      })
      .eq("id", prod.id)
      .select("*")
      .single();
    if (!saved) {
      // The draft exists; only the trail failed to update. Say so plainly
      // rather than crash on a null row.
      return await fail("הטיוטה נשמרה, אבל רישום ההפקה נכשל. הטיוטה נמצאת בפאנל, תחת טיוטות.", 500, { article_id: inserted.id });
    }

    // From here the draft is saved and the production is "ready": a failure in
    // the extras below must not turn it into "failed".
    const shaped = await shapeProduction(supabase, saved);
    const existing = await alreadyOnSite(supabase, queries.entities, inserted.id).catch(() => []);
    return json({ ...shaped, keyFacts: (written.key_facts || []).slice(0, 5), existing });
  } catch (e: any) {
    console.error("quick-article draft error", e);
    const message = `הכנת הטיוטה נכשלה: ${String(e?.message || e).slice(0, 300)}`;
    if (draftId) {
      const { data: now } = await supabase.from("quick_productions").select("status").eq("id", prod.id).maybeSingle();
      // Saved and ready: the page can reload it by id.
      if (now?.status === "ready") return json({ error: `${message} הטיוטה נשמרה. פתחו אותה מ"הפקות אחרונות".` }, 500);
    }
    return await fail(message, 500);
  }
}

async function actionReview(supabase: any, body: any): Promise<Response> {
  const prod = await loadProduction(supabase, body?.productionId);
  if (!prod?.article_id) return json({ error: "ההפקה לא נמצאה" }, 404);
  const title = String(body?.title ?? "").trim();
  const content = String(body?.content ?? "");
  if (!title || !content) return json({ error: "חסרים כותרת או גוף כתבה לבדיקה" }, 400);

  const data = await claudeFirst({
    messages: [
      {
        role: "system",
        content: `אתה עורך משנה קפדן באתר חדשות. קיבלת טיוטת כתבה בעברית ואת המקורות שמהם נכתבה. עבור על הטיוטה משפט אחר משפט.
1. דיוק: כל שם, מספר, תאריך, סכום, תפקיד וציטוט בטיוטה מופיע ב"מקורות שנקראו". משפט שיש בו עובדה בלי גיבוי נכנס ל-unsupported, מועתק מהטיוטה מילה במילה, עם הסבר קצר מה חסר.
2. הסקשן "למה זה חשוב לך" נבדק באותה מידה: טענה על משמעות שאין לה בסיס במקורות נכנסת ל-unsupported.
3. כותרת ותקציר: משקפים את הכתבה, בלי הבטחת יתר.
4. ייחוס: אם כל המקורות נשענים על אותו דיווח מקורי של כלי תקשורת אחד, single_origin=true ושמו ב-origin_outlet.
ציון 1-10: 10 = מוכן לפרסום כמו שהוא. 6 ומטה = אסור לפרסם בלי תיקון. משפט אחד בלי גיבוי מוריד את הציון ל-6 לכל היותר.
החזר רק דרך הכלי review_quick_article.`,
      },
      {
        role: "user",
        content:
          `=== הטיוטה ===\nכותרת: ${title}\nתקציר: ${String(body?.excerpt ?? "")}\n\n${htmlToText(content).slice(0, 9000)}\n\n` +
          `${String(prod.research || "").slice(0, 60_000)}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "review_quick_article",
          description: "פסק דין של עורך המשנה על הטיוטה",
          parameters: {
            type: "object",
            properties: {
              score: { type: "integer", description: "1-10" },
              issues: { type: "array", items: { type: "string" } },
              unsupported: {
                type: "array",
                items: {
                  type: "object",
                  properties: { sentence: { type: "string" }, reason: { type: "string" } },
                  required: ["sentence", "reason"],
                  additionalProperties: false,
                },
              },
              single_origin: { type: "boolean" },
              origin_outlet: { type: "string" },
            },
            required: ["score", "issues", "unsupported", "single_origin", "origin_outlet"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "review_quick_article" } },
  });
  const verdict = toolArgs(data) as {
    score: number;
    issues: string[];
    unsupported: { sentence: string; reason: string }[];
    single_origin: boolean;
    origin_outlet: string;
  };
  const score = Math.min(Math.max(Number(verdict.score) || 1, 1), 10);
  const issues = (verdict.issues || []).filter(Boolean).slice(0, 6);
  const unsupported = (verdict.unsupported || [])
    .filter((u) => u?.sentence)
    .slice(0, 12)
    .map((u) => ({ sentence: String(u.sentence).slice(0, 400), reason: String(u.reason || "").slice(0, 200) }));

  // The verdict is stored on the draft only: a live article is never touched
  // from here.
  const { data: article } = await supabase
    .from("articles")
    .update({ review_score: score, review_note: issues.length ? issues.join(" · ").slice(0, 800) : "הפקה מהירה. בלי הערות." })
    .eq("id", prod.article_id)
    .eq("is_draft", true)
    .select("updated_at, review_score, review_note")
    .maybeSingle();

  const singleSource = !!prod.single_source || !!verdict.single_origin;
  const origin = String(verdict.origin_outlet || "").trim();
  const singleSourceNote = prod.single_source_note ||
    (verdict.single_origin ? `כל המקורות שנקראו מצטטים את אותו דיווח${origin ? `: ${origin}` : ""}.` : null);
  await supabase
    .from("quick_productions")
    .update({
      unsupported,
      single_source: singleSource,
      single_source_note: singleSourceNote,
      reviewed_hash: await textHash(title, String(body?.excerpt ?? ""), content),
    })
    .eq("id", prod.id);

  return json({
    reviewScore: score,
    issues,
    unsupported,
    singleSource,
    singleSourceNote,
    articleUpdatedAt: article?.updated_at ?? null,
  });
}

async function actionTeasers(supabase: any, body: any): Promise<Response> {
  const prod = await loadProduction(supabase, body?.productionId);
  if (!prod?.article_id) return json({ error: "ההפקה לא נמצאה" }, 404);
  const { data: article } = await supabase
    .from("articles")
    .select("slug, title, excerpt, category, content")
    .eq("id", prod.article_id)
    .maybeSingle();
  if (!article) return json({ error: "הכתבה לא נמצאה" }, 404);
  const context = await loadContext(supabase);

  const forPost = (network: Network | "whatsapp"): ArticleForPost => ({
    title: String(body?.title ?? article.title),
    excerpt: String(body?.excerpt ?? article.excerpt),
    category: article.category,
    content: String(body?.content ?? article.content ?? ""),
    url: articleUrl(network, article.slug || prod.article_id),
  });

  // The same writer, the same teaser rules and the same flags the publisher
  // would use, so what is approved here is what the publisher would have
  // written itself. ctaAppended: the "הגיבו X" line is added at publish time
  // and the teaser must not end on a call to action of its own.
  const jobs: [Network | "whatsapp", Promise<string>][] = [
    ["facebook", generatePostText(forPost("facebook"), "facebook", { ctaAppended: context.dmAutomation })],
    ["instagram", generatePostText(forPost("instagram"), "instagram", { ctaAppended: context.dmAutomation })],
    ["linkedin", generatePostText(forPost("linkedin"), "linkedin", { linkInComment: context.linkedinLinkInComment })],
    ["whatsapp", generatePostText(forPost("whatsapp"), "whatsapp")],
  ];
  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  const teasers: Record<string, string> = {};
  const failed: string[] = [];
  settled.forEach((r, i) => {
    const network = jobs[i][0];
    if (r.status === "fulfilled") teasers[network] = noLongDashes(r.value);
    else failed.push(network);
  });
  if (Object.keys(teasers).length === 0) return json({ error: "כתיבת הטיזרים נכשלה. נסו שוב." }, 502);

  await supabase.from("quick_productions").update({ teasers }).eq("id", prod.id);
  return json({ teasers, failed });
}

async function actionImage(supabase: any, body: any): Promise<Response> {
  const prod = await loadProduction(supabase, body?.productionId);
  if (!prod?.article_id) return json({ error: "ההפקה לא נמצאה" }, 404);

  const pastedUrl = String(body?.imageUrl ?? "").trim();
  let imageUrl: string | null = null;
  if (pastedUrl) {
    if (!/^https:\/\/\S+$/i.test(pastedUrl) || !isPublicHttpUrl(pastedUrl)) {
      return json({ error: "כתובת התמונה חייבת להיות כתובת ציבורית שמתחילה ב-https" }, 400);
    }
    imageUrl = await mirrorImageToBucket(supabase, pastedUrl);
    if (!imageUrl) return json({ error: "לא הצלחנו להוריד את התמונה מהכתובת הזאת" }, 422);
  } else {
    const prompt = String(prod.image_prompt || "").trim() || "Abstract editorial illustration about technology news";
    try {
      imageUrl = await generateGeminiImage(
        supabase,
        `${prompt}. Abstract editorial illustration, clean and modern, no real people, no recognizable faces, no logos, no text or watermarks, 16:9 composition.`,
        { aspectRatio: "16:9", pathPrefix: `quick/${Date.now()}` },
      );
    } catch (e) {
      return json({ error: `יצירת התמונה נכשלה: ${String((e as Error).message).slice(0, 200)}` }, 502);
    }
  }

  const { data: article } = await supabase
    .from("articles")
    .update({ image_url: imageUrl })
    .eq("id", prod.article_id)
    .eq("is_draft", true)
    .select("updated_at, image_url")
    .maybeSingle();
  if (!article) return json({ error: "הכתבה כבר לא טיוטה. התמונה לא הוחלפה." }, 409);
  return json({ imageUrl: article.image_url, articleUpdatedAt: article.updated_at });
}

/** Hands one queue row to the publisher, as the admin who approved it. */
function kickPublisher(queueId: string, authHeader: string): Promise<void> {
  return fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-publish`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ queueId }),
  })
    .then(async (r) => {
      if (!r.ok) console.error("quick-article: social-publish answered", r.status, (await r.text()).slice(0, 200));
      else await r.body?.cancel();
    })
    // Not fatal: the row is queued for now, so the 5-minute sweep picks it up.
    .catch((e) => console.error("quick-article: social-publish call failed", (e as Error).message));
}

/**
 * Keeps the instance alive for the publisher call after the response is sent,
 * so the editor sees "the article is live" at once instead of waiting for
 * three networks. Without the runtime hook it simply waits.
 */
async function inBackground(work: Promise<void>): Promise<void> {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(work);
  else await work;
}

/** A lock older than this was left behind by an attempt that died; it may be taken over. */
const STALE_LOCK_MS = 3 * 60_000;

async function actionPublish(supabase: any, body: any, userId: string, authHeader: string): Promise<Response> {
  const productionId = String(body?.productionId ?? "");
  const expectedUpdatedAt = String(body?.expectedUpdatedAt ?? "");
  const title = noLongDashes(String(body?.title ?? "").trim());
  const excerpt = noLongDashes(String(body?.excerpt ?? "").trim());
  const content = noLongDashes(String(body?.content ?? ""));
  if (!productionId || !expectedUpdatedAt || !title || !excerpt || !content) {
    return json({ error: "חסרים פרטים לפרסום" }, 400);
  }

  // --- 1. Lock: ready -> publishing. A second click finds nothing to claim. --
  const { data: locked } = await supabase
    .from("quick_productions")
    .update({ status: "publishing", error: null })
    .eq("id", productionId)
    .eq("status", "ready")
    .select("*");
  let prod = locked?.[0] ?? null;

  if (!prod) {
    // Nothing claimed. Either another request holds the lock right now, or an
    // earlier attempt died holding it. Only the second may be taken over, and
    // only by looking at what actually happened to the article.
    const current = await loadProduction(supabase, productionId);
    if (!current?.article_id) return json({ error: "ההפקה לא נמצאה" }, 404);
    const stale = current.status === "publishing" && Date.now() - Date.parse(current.updated_at) > STALE_LOCK_MS;
    if (stale) {
      const { data: art } = await supabase.from("articles").select("is_draft").eq("id", current.article_id).maybeSingle();
      if (art?.is_draft === false) {
        await supabase.from("quick_productions").update({ status: "published" }).eq("id", productionId).eq("status", "publishing");
        return json({ error: "הכתבה כבר באוויר. טענו את ההפקה מחדש כדי לראות את הסטטוס." }, 409);
      }
      if (art?.is_draft === true) {
        // Same atomic claim, keyed on the stale row itself.
        const { data: reclaimed } = await supabase
          .from("quick_productions")
          .update({ error: null })
          .eq("id", productionId)
          .eq("status", "publishing")
          .eq("updated_at", current.updated_at)
          .select("*");
        prod = reclaimed?.[0] ?? null;
      }
    }
    if (!prod) return json({ error: "ההפקה כבר בתהליך פרסום, פורסמה או בוטלה. טענו אותה מחדש." }, 409);
  }

  const unlock = async (message: string, status: number) => {
    const { error: unlockErr } = await supabase
      .from("quick_productions")
      .update({ status: "ready", error: message.slice(0, 500) })
      .eq("id", productionId)
      .eq("status", "publishing");
    // A lock that could not be released is taken over after STALE_LOCK_MS.
    if (unlockErr) console.error("quick-article: unlock failed", unlockErr.message);
    return json({ error: message }, status);
  };

  /** What became of the article, when the code cannot tell from its own flow. */
  const settle = async (message: string): Promise<Response> => {
    const { data: after, error: afterErr } = await supabase
      .from("articles")
      .select("is_draft, slug, published_at")
      .eq("id", prod.article_id)
      .maybeSingle();
    if (!afterErr && after?.is_draft === true) return await unlock(message, 500);
    if (!afterErr && after?.is_draft === false) {
      // Live. The production must say so, whatever went wrong around it.
      await supabase.from("quick_productions").update({ status: "published" }).eq("id", productionId).eq("status", "publishing");
      return json({
        ok: true,
        articleId: prod.article_id,
        slug: after.slug,
        url: `${SITE_URL}/article/${encodeURIComponent(after.slug)}`,
        publishedAt: after.published_at,
        queueId: null,
        platforms: [],
        skipped: [],
        nextBuildAt: nextBuildAt(),
      });
    }
    // Could not even read the article: leave the lock; it is reclaimable.
    return json({ error: "לא ברור אם הכתבה עלתה לאתר. טענו את ההפקה מחדש בעוד דקה." }, 500);
  };

  try {
    if (prod.single_source && body?.acknowledgeSingleSource !== true) {
      return await unlock("הידיעה נשענת על מקור יחיד. סמנו שראיתם את זה לפני הפרסום.", 422);
    }
    // The list is the last review's. Fixing the sentence and reviewing again
    // empties it; publishing over it takes a deliberate tick.
    if (Array.isArray(prod.unsupported) && prod.unsupported.length > 0 && body?.acknowledgeUnsupported !== true) {
      return await unlock("בביקורת האחרונה סומנו משפטים בלי גיבוי במקורות. תקנו ובדקו שוב, או סמנו שראיתם.", 422);
    }
    // The editor's review score belongs to one exact text. Checked before
    // anything is written, so a refused publish leaves the draft as it was.
    if (!prod.reviewed_hash || prod.reviewed_hash !== await textHash(title, excerpt, content)) {
      return await unlock('הטקסט השתנה מאז ביקורת העורך. לחצו "בדוק שוב" ואז אשרו.', 422);
    }

    // --- 2. The text on the editor's screen becomes the draft ---------------
    // Refused if the row changed since it was shown: the ingest updater can
    // append an "עדכון" block to a draft, and that must not ride along unseen.
    const { data: savedRows } = await supabase
      .from("articles")
      .update({ title: title.slice(0, 300), excerpt: excerpt.slice(0, 400), content })
      .eq("id", prod.article_id)
      .eq("is_draft", true)
      .eq("updated_at", expectedUpdatedAt)
      .select(ARTICLE_COLS);
    const saved = savedRows?.[0];
    if (!saved) return await unlock("הטיוטה השתנתה מאז שהוצגה, או שכבר פורסמה. טענו את ההפקה מחדש.", 409);

    // --- 3. The ten checks, on exactly what is about to go live -------------
    const audit = auditArticle({
      id: saved.id,
      title: saved.title,
      excerpt: saved.excerpt,
      content: saved.content,
      slug: saved.slug,
      image_url: saved.image_url,
      source_url: saved.source_url,
      review_score: saved.review_score,
    });
    if (audit.score < 100) {
      const failing = audit.checks.filter((c) => !c.ok).map((c) => `${c.label} (${c.detail})`).join(" · ");
      return await unlock(`הכתבה לא עוברת את בדיקות האיכות: ${failing}`, 422);
    }

    // --- 4. Which networks, and with which text -----------------------------
    const context = await loadContext(supabase);
    const ageHours = (Date.now() - Date.parse(saved.source_published_at || new Date().toISOString())) / 3_600_000;
    const tooOld = ageHours > context.maxStoryAgeHours;
    const wanted: Network[] = (Array.isArray(body?.platforms) ? body.platforms : [])
      .filter((p: unknown): p is Network => (NETWORKS as readonly string[]).includes(String(p)));
    const skipped: { platform: string; reason: string }[] = [];
    const teasers: Record<string, string> = {};
    for (const network of wanted) {
      if (tooOld) {
        skipped.push({ platform: network, reason: `הידיעה בת ${Math.round(ageHours)} שעות, ישנה מדי לרשתות` });
        continue;
      }
      if (!context.enabledPlatforms.includes(network)) {
        skipped.push({ platform: network, reason: "החשבון לא מחובר או כבוי" });
        continue;
      }
      if (network === "linkedin" && context.linkedin.full) {
        skipped.push({ platform: network, reason: `תקרת LinkedIn היומית מלאה (${context.linkedin.postedToday}/${context.linkedin.cap})` });
        continue;
      }
      const text = noLongDashes(String(body?.teasers?.[network] ?? "").trim());
      if (!text) return await unlock(`חסר טקסט לפוסט ב-${network}`, 422);
      teasers[network] = withFinalUrl(text, articleUrl(network, saved.slug));
    }

    // --- 5. One transaction: live + pending texts + queue row + "published" --
    const { data: published, error: rpcErr } = await supabase.rpc("quick_publish", {
      _production_id: productionId,
      _expected_updated_at: saved.updated_at,
      _is_breaking: body?.isBreaking === true,
      _teasers: teasers,
      _approved_by: userId,
    });
    // An error here does not prove nothing happened: the transaction may have
    // committed and only its answer was lost. Look before stepping back.
    if (rpcErr || !published) return await settle(`הפרסום נכשל: ${rpcErr?.message ?? "אין תשובה"}`);

    // The article is live from here on, and the transaction itself marked the
    // production "published". Nothing below may put it back to "ready".
    const queueId: string | null = published.queue_id ?? null;
    if (queueId) await inBackground(kickPublisher(queueId, authHeader));

    return json({
      ok: true,
      articleId: published.article_id,
      slug: published.slug,
      url: `${SITE_URL}/article/${encodeURIComponent(published.slug)}`,
      publishedAt: published.published_at,
      queueId,
      platforms: published.platforms ?? [],
      skipped,
      nextBuildAt: context.nextBuildAt,
    });
  } catch (e: any) {
    console.error("quick-article publish error", e);
    return await settle(`הפרסום נכשל: ${String(e?.message || e).slice(0, 300)}`);
  }
}

function postLink(platform: string, externalId: string | null): string | null {
  if (!externalId) return null;
  if (platform === "facebook") return `https://www.facebook.com/${externalId}`;
  if (platform === "linkedin") return `https://www.linkedin.com/feed/update/${externalId}`;
  return null;
}

async function actionStatus(supabase: any, body: any): Promise<Response> {
  const prod = await loadProduction(supabase, body?.productionId);
  if (!prod?.article_id) return json({ error: "ההפקה לא נמצאה" }, 404);
  const platforms: string[] = prod.platforms ?? [];
  const queueIds: string[] = prod.queue_ids ?? [];

  const [{ data: article }, { data: queue }, { data: posts }] = await Promise.all([
    supabase.from("articles").select("slug, is_draft, published_at").eq("id", prod.article_id).maybeSingle(),
    queueIds.length
      ? supabase.from("social_queue").select("id, status, error, platforms, created_at").in("id", queueIds)
      : Promise.resolve({ data: [] }),
    platforms.length
      ? supabase.from("social_posts").select("platform, status, external_id, error").eq("article_id", prod.article_id).in("platform", platforms)
      : Promise.resolve({ data: [] }),
  ]);

  const rows = (queue ?? []) as { id: string; status: string; error: string | null; platforms: string[]; created_at: string }[];
  const running = rows.some((q) => q.status === "queued" || q.status === "publishing");
  const lastRow = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)).pop();

  // The ledger is the truth, not our queue row: the freshness sweep may move
  // an article to another row, and the post still goes out with the approved
  // text. So each network is read from social_posts.
  const networks = platforms.map((platform) => {
    const post = ((posts ?? []) as any[]).find((p) => p.platform === platform);
    if (post?.status === "posted") {
      return { platform, state: "posted", link: postLink(platform, post.external_id), note: redact(post.error) };
    }
    if (post?.status === "failed") return { platform, state: "failed", link: null, note: redact(post.error) || "נכשל" };
    if (running) return { platform, state: "waiting", link: null, note: null };
    // Still pending after the row finished: the publisher left it out.
    return { platform, state: "skipped", link: null, note: redact(lastRow?.error) || "לא פורסם (תקרה יומית, או שהפריט בוטל)" };
  });

  const done = !running;
  if (done && platforms.length && !prod.results) {
    await supabase.from("quick_productions").update({ results: networks }).eq("id", prod.id);
  }

  return json({
    productionId: prod.id,
    status: prod.status,
    live: article ? !article.is_draft : false,
    slug: article?.slug ?? null,
    url: article?.slug ? `${SITE_URL}/article/${encodeURIComponent(article.slug)}` : null,
    publishedAt: article?.published_at ?? null,
    done,
    networks,
  });
}

async function actionRetrySocial(supabase: any, body: any, authHeader: string): Promise<Response> {
  const prod = await loadProduction(supabase, body?.productionId);
  if (!prod?.article_id || prod.status !== "published") return json({ error: "אין הפקה שפורסמה לנסות עליה שוב" }, 409);
  const { data: article } = await supabase.from("articles").select("is_draft").eq("id", prod.article_id).maybeSingle();
  if (article?.is_draft !== false) return json({ error: "הכתבה לא באוויר" }, 409);

  // Only a network the editor approved in the original publish, with the text
  // approved then. A retry sends nothing new.
  const approved = (prod.approved_teasers ?? {}) as Record<string, string>;
  const wanted = (Array.isArray(body?.platforms) ? body.platforms : Object.keys(approved))
    .map((p: unknown) => String(p))
    .filter((p: string) => !!approved[p]?.trim());

  // The claim is the row itself: failed -> pending, one statement per network.
  // A second click finds no failed row and gets nothing, so it cannot queue a
  // second post. The approved copy goes back in with the same statement,
  // because a failed row has lost its text.
  const claimed: string[] = [];
  for (const platform of wanted) {
    const { data: rows } = await supabase
      .from("social_posts")
      .update({ status: "pending", post_text: approved[platform], external_id: null, error: null })
      .eq("article_id", prod.article_id)
      .eq("platform", platform)
      .eq("status", "failed")
      .select("platform");
    if (rows?.length) claimed.push(platform);
  }
  if (claimed.length === 0) return json({ error: "אין רשת שנכשלה לנסות שוב (ייתכן שניסיון חוזר כבר בדרך)" }, 409);

  const { data: row, error } = await supabase
    .from("social_queue")
    .insert({ article_id: prod.article_id, platforms: claimed, kind: "post", scheduled_at: new Date().toISOString(), status: "queued", source: "manual" })
    .select("id")
    .single();
  if (error || !row) return json({ error: `הכנסת הפריט לתור נכשלה: ${error?.message ?? ""}` }, 500);

  await supabase
    .from("quick_productions")
    .update({ queue_ids: [...(prod.queue_ids ?? []), row.id], results: null })
    .eq("id", prod.id);
  await inBackground(kickPublisher(row.id, authHeader));
  return json({ ok: true, queueId: row.id, platforms: claimed });
}

async function actionUnpublish(supabase: any, body: any): Promise<Response> {
  const prod = await loadProduction(supabase, body?.productionId);
  if (!prod?.article_id || prod.status !== "published") return json({ error: "אין הפקה שפורסמה לבטל" }, 409);

  const { data: back } = await supabase
    .from("articles")
    .update({ is_draft: true, is_breaking: false })
    .eq("id", prod.article_id)
    .eq("is_draft", false)
    .select("id");
  if (!back || back.length === 0) return json({ error: "הכתבה כבר לא באוויר" }, 409);

  // A post still waiting must not go out for an article that was pulled.
  await supabase
    .from("social_queue")
    .update({ status: "cancelled", error: "הפרסום בוטל מדף ההפקה המהירה", updated_at: new Date().toISOString() })
    .eq("article_id", prod.article_id)
    .eq("status", "queued");
  await supabase.from("quick_productions").update({ status: "unpublished" }).eq("id", prod.id);
  return json({ ok: true });
}

async function actionRecent(supabase: any): Promise<Response> {
  const { data } = await supabase
    .from("quick_productions")
    .select("id, requested_title, status, origin, single_source, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  return json({
    items: ((data ?? []) as any[]).map((r) => ({
      productionId: r.id,
      requestedTitle: r.requested_title,
      status: r.status,
      origin: r.origin,
      singleSource: r.single_source,
      createdAt: r.created_at,
    })),
  });
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const supabase = adminClient();
  try {
    const body = await req.json().catch(() => ({}));
    switch (String(body?.action ?? "")) {
      case "draft":
        return await actionDraft(supabase, body, auth.userId);
      case "review":
        return await actionReview(supabase, body);
      case "teasers":
        return await actionTeasers(supabase, body);
      case "image":
        return await actionImage(supabase, body);
      case "get": {
        const prod = await loadProduction(supabase, body?.productionId);
        if (!prod) return json({ error: "ההפקה לא נמצאה" }, 404);
        return json(await shapeProduction(supabase, prod));
      }
      case "recent":
        return await actionRecent(supabase);
      case "context":
        return json(await loadContext(supabase));
      case "publish":
        return await actionPublish(supabase, body, auth.userId, auth.authHeader);
      case "status":
        return await actionStatus(supabase, body);
      case "retry_social":
        return await actionRetrySocial(supabase, body, auth.authHeader);
      case "unpublish":
        return await actionUnpublish(supabase, body);
      default:
        return json({ error: "פעולה לא מוכרת" }, 400);
    }
  } catch (e: any) {
    console.error("quick-article error", e);
    return json({ error: String(e?.message || e).slice(0, 300) || "שגיאה לא ידועה" }, 500);
  }
});
