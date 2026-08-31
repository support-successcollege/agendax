// deno-lint-ignore-file no-explicit-any
// Publishes articles to the connected social networks — the one door for
// Instagram, Facebook, LinkedIn and X.
//
// Modes:
//   { articleId, platforms?: string[], kind?: "post"|"story", force? }
//     — manual: post one article now to the given platforms (default: every
//     enabled one). Re-posting a platform that already has a row for this
//     article is refused unless force: true.
//   { queueId }                          — run one social_queue item now.
//   { auto: true }                       — the cron sweep (every 5 minutes):
//     1. fill: when social_settings.auto_fill is on, the free publishing
//        slots of today and tomorrow (publish_hours, capped by posts_per_day)
//        get the freshest published articles that were never posted/queued;
//     2. run: every queued item whose time has come is published.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";
import {
  SITE_URL,
  generatePostText,
  publishFacebook,
  publishFacebookStory,
  publishInstagram,
  publishInstagramStory,
  publishLinkedIn,
  publishX,
  type ArticleForPost,
} from "../_shared/social.ts";

const TZ = "Asia/Jerusalem";
const ARTICLE_COLS = "id, slug, title, excerpt, category, category_slug, content, image_url";

/**
 * The branded images (4:5 post, 9:16 story) are rendered by the social-image
 * function — one fresh worker per render, because satori + resvg at these
 * sizes exhaust a single worker when two renders share it. Cached in storage
 * at social/{id}.png and social/{id}-story.png; this call returns the URL.
 */
async function renderedImageUrl(supabase: any, article: ArticleRow, variant: "post" | "story"): Promise<string | null> {
  // Already rendered on an earlier pass? Skip the render worker entirely.
  const path = variant === "story" ? `social/${article.id}-story.png` : `social/${article.id}.png`;
  const publicUrl: string = supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;
  const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return publicUrl;

  const secret = Deno.env.get("INGEST_CRON_SECRET");
  if (!secret) return null;
  // Two attempts: a render worker that just finished a heavy job can answer
  // 546 once before the runtime recycles it.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
        body: JSON.stringify({ articleId: article.id, variant }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.url) return String(data.url);
      lastError = data?.error || `HTTP ${resp.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.error(`${variant} image render failed:`, lastError);
  return null;
}

/**
 * Post image, with the raw article photo as the fallback — a plain photo beats
 * no post. The fallback is logged loudly: a post going out with the unbranded
 * photo used to be invisible until someone noticed it on the feed.
 */
async function brandedImageUrl(supabase: any, article: ArticleRow): Promise<string> {
  const branded = await renderedImageUrl(supabase, article, "post");
  if (branded) return branded;
  console.error(
    `FALLBACK IMAGE: הכתבה "${article.title.slice(0, 60)}" (${article.id}) מתפרסמת עם התמונה הגולמית — רינדור התמונה המעוצבת נכשל`,
  );
  return article.image_url;
}

/** Story image; null when rendering failed (the story is then skipped). */
async function storyImageUrl(supabase: any, article: ArticleRow): Promise<string | null> {
  return await renderedImageUrl(supabase, article, "story");
}

/**
 * A story on Facebook / Instagram: the 9:16 branded image with the site
 * address baked in (the API allows no link sticker). Ledger row platform
 * "<platform>_story".
 */
async function publishStory(
  supabase: any,
  article: ArticleRow,
  account: Account,
): Promise<{ platform: string; ok: boolean; error?: string }> {
  const storyPlatform = `${account.platform}_story`;
  if (account.platform !== "facebook" && account.platform !== "instagram") {
    return { platform: storyPlatform, ok: false, error: "סטורי אפשרי רק בפייסבוק ואינסטגרם" };
  }
  try {
    const image = await storyImageUrl(supabase, article);
    if (!image) throw new Error("רינדור תמונת הסטורי נכשל");
    const { externalId } = account.platform === "facebook"
      ? await publishFacebookStory(account.credentials, { imageUrl: image })
      : await publishInstagramStory(account.credentials, { imageUrl: image });
    await supabase.from("social_posts").upsert(
      { article_id: article.id, platform: storyPlatform, status: "posted", external_id: externalId, post_text: null, error: null },
      { onConflict: "article_id,platform" },
    );
    return { platform: storyPlatform, ok: true };
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error(`${storyPlatform} failed:`, message);
    await supabase.from("social_posts").upsert(
      { article_id: article.id, platform: storyPlatform, status: "failed", post_text: null, error: message.slice(0, 500) },
      { onConflict: "article_id,platform" },
    );
    return { platform: storyPlatform, ok: false, error: message };
  }
}

type Platform = "facebook" | "instagram" | "linkedin" | "x";

type Account = {
  platform: Platform;
  enabled: boolean;
  auto_publish: boolean;
  credentials: Record<string, string>;
};

type ArticleRow = {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string;
  category: string;
  category_slug: string;
  content: string;
  image_url: string;
};

type Settings = {
  posts_per_day: number;
  publish_hours: string[];
  auto_fill: boolean;
  auto_stories: boolean;
};

type QueueRow = {
  id: string;
  article_id: string;
  platforms: string[];
  kind: "post" | "story";
  scheduled_at: string;
  status: string;
  source: string;
};

async function publishOne(
  supabase: any,
  article: ArticleRow,
  account: Account,
): Promise<{ platform: string; ok: boolean; error?: string }> {
  // Facebook renders and linkifies the raw Hebrew URL correctly, so it gets
  // the readable form. LinkedIn's and X's URL detectors stop at the first
  // non-Latin character — a raw Hebrew slug got cut to /article/ and the
  // lnkd.in short link led nowhere — so they get the percent-encoded form,
  // which readers never see anyway (both display a lnkd.in / t.co link).
  const slug = article.slug || article.id;
  const url = account.platform === "facebook" || account.platform === "instagram"
    ? `${SITE_URL}/article/${slug}`
    : `${SITE_URL}/article/${encodeURIComponent(slug)}`;
  const forPost: ArticleForPost = {
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    content: article.content || "",
    url,
  };

  try {
    const text = await generatePostText(forPost, account.platform);
    let externalId = "";
    switch (account.platform) {
      case "facebook": {
        const image = await brandedImageUrl(supabase, article);
        ({ externalId } = await publishFacebook(account.credentials, { text, link: url, imageUrl: image }));
        break;
      }
      case "instagram": {
        const image = await brandedImageUrl(supabase, article);
        ({ externalId } = await publishInstagram(account.credentials, {
          caption: text,
          imageUrl: image,
        }));
        break;
      }
      case "x": {
        const image = await brandedImageUrl(supabase, article);
        ({ externalId } = await publishX(account.credentials, { text, imageUrl: image }));
        break;
      }
      case "linkedin": {
        const image = await brandedImageUrl(supabase, article);
        ({ externalId } = await publishLinkedIn(account.credentials, { text, link: url, imageUrl: image }));
        break;
      }
    }
    await supabase.from("social_posts").upsert(
      {
        article_id: article.id,
        platform: account.platform,
        status: "posted",
        external_id: externalId,
        post_text: text,
        error: null,
      },
      { onConflict: "article_id,platform" },
    );
    return { platform: account.platform, ok: true };
  } catch (e: any) {
    const message = e?.message || String(e);
    await supabase.from("social_posts").upsert(
      {
        article_id: article.id,
        platform: account.platform,
        status: "failed",
        post_text: null,
        error: message.slice(0, 500),
      },
      { onConflict: "article_id,platform" },
    );
    return { platform: account.platform, ok: false, error: message };
  }
}

/** Post or story of one article to a set of accounts. */
async function publishTo(
  supabase: any,
  article: ArticleRow,
  targets: Account[],
  kind: "post" | "story",
): Promise<{ platform: string; ok: boolean; error?: string }[]> {
  const results = [];
  for (const account of targets) {
    results.push(kind === "story" ? await publishStory(supabase, article, account) : await publishOne(supabase, article, account));
  }
  return results;
}

// ---------- time helpers (Israel calendar) ----------

/** "YYYY-MM-DD" of a moment in Israel time. */
function israelDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Offset of Israel time from UTC, in minutes, at the given moment. */
function israelOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The UTC instant of "HH:MM" on an Israel calendar day. */
function israelSlotToUtc(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  return new Date(guess.getTime() - israelOffsetMinutes(guess) * 60_000);
}

/** Adds n days to a "YYYY-MM-DD" string. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- queue engine ----------

async function loadSettings(supabase: any): Promise<Settings> {
  const { data } = await supabase.from("social_settings").select("*").eq("id", 1).maybeSingle();
  const hours: string[] = Array.isArray(data?.publish_hours) ? data.publish_hours : ["09:00", "13:00", "19:00"];
  return {
    posts_per_day: Number.isFinite(data?.posts_per_day) ? data.posts_per_day : 3,
    publish_hours: hours.filter((h) => /^\d{2}:\d{2}$/.test(h)).sort(),
    auto_fill: data?.auto_fill ?? true,
    auto_stories: data?.auto_stories ?? false,
  };
}

/**
 * Fill the free slots of today and tomorrow with fresh articles. A slot is
 * "free" when the day has fewer non-cancelled posts than posts_per_day and no
 * item sits within 20 minutes of the slot. Candidates: published in the last
 * 3 days, not marketing, never queued (except cancelled) and never posted.
 */
async function fillQueue(supabase: any, settings: Settings, autoAccounts: Account[]): Promise<any[]> {
  if (!settings.auto_fill || autoAccounts.length === 0 || settings.posts_per_day <= 0) return [];
  const slots = settings.publish_hours.slice(0, settings.posts_per_day);
  if (slots.length === 0) return [];

  const now = new Date();
  const today = israelDate(now);
  const days = [today, addDays(today, 1)];

  const { data: queued } = await supabase
    .from("social_queue")
    .select("id, article_id, scheduled_at, status, kind")
    .neq("status", "cancelled")
    .gte("scheduled_at", new Date(now.getTime() - 36 * 3600_000).toISOString())
    .lte("scheduled_at", new Date(now.getTime() + 60 * 3600_000).toISOString());
  const existing: { scheduled_at: string; kind: string }[] = queued ?? [];
  const postsOnDay = (day: string) => existing.filter((q) => q.kind === "post" && israelDate(new Date(q.scheduled_at)) === day).length;

  const freeSlots: Date[] = [];
  for (const day of days) {
    let used = postsOnDay(day);
    for (const hhmm of slots) {
      if (used >= settings.posts_per_day) break;
      const at = israelSlotToUtc(day, hhmm);
      if (at.getTime() < now.getTime() + 60_000) continue;
      const taken = existing.some((q) => Math.abs(new Date(q.scheduled_at).getTime() - at.getTime()) < 20 * 60_000);
      if (taken) continue;
      freeSlots.push(at);
      used++;
    }
  }
  if (freeSlots.length === 0) return [];

  // Articles already handled — queued (any live status) or posted.
  const { data: everQueued } = await supabase.from("social_queue").select("article_id").neq("status", "cancelled");
  const { data: everPosted } = await supabase.from("social_posts").select("article_id").eq("status", "posted");
  const handled = new Set<string>([
    ...((everQueued ?? []) as any[]).map((r) => r.article_id),
    ...((everPosted ?? []) as any[]).map((r) => r.article_id),
  ]);

  const since = new Date(now.getTime() - 3 * 24 * 3600_000).toISOString();
  const { data: fresh } = await supabase
    .from("articles")
    .select("id, title, is_breaking, published_at")
    .eq("is_draft", false)
    .neq("category_slug", "marketing")
    .gte("published_at", since)
    .order("is_breaking", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(60);
  const candidates = ((fresh ?? []) as any[]).filter((a) => !handled.has(a.id));

  const platforms = autoAccounts.map((a) => a.platform);
  const inserted: any[] = [];
  for (let i = 0; i < freeSlots.length && i < candidates.length; i++) {
    const article = candidates[i];
    const at = freeSlots[i];
    const rows: any[] = [{ article_id: article.id, platforms, kind: "post", scheduled_at: at.toISOString(), source: "auto" }];
    if (settings.auto_stories && platforms.some((p) => p === "facebook" || p === "instagram")) {
      rows.push({
        article_id: article.id,
        platforms: platforms.filter((p) => p === "facebook" || p === "instagram"),
        kind: "story",
        // A few minutes after the post, so the story points at something that is already up.
        scheduled_at: new Date(at.getTime() + 5 * 60_000).toISOString(),
        source: "auto",
      });
    }
    const { error } = await supabase.from("social_queue").insert(rows);
    if (!error) inserted.push({ article: article.title, at: at.toISOString(), story: rows.length > 1 });
    else console.error("queue insert failed", error.message);
  }
  return inserted;
}

/** Publish one queue item; marks it publishing → posted/failed. */
async function runQueueItem(supabase: any, item: QueueRow, accounts: Account[]): Promise<any> {
  // Claim it — a second sweep that overlaps must not double-post.
  const { data: claimed } = await supabase
    .from("social_queue")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed || claimed.length === 0) return { id: item.id, skipped: "נתפס על ידי ריצה אחרת" };

  const finish = async (patch: Record<string, unknown>) =>
    await supabase.from("social_queue").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", item.id);

  const { data: article } = await supabase.from("articles").select(`${ARTICLE_COLS}, is_draft`).eq("id", item.article_id).maybeSingle();
  if (!article) {
    await finish({ status: "failed", error: "הכתבה לא נמצאה" });
    return { id: item.id, ok: false, error: "הכתבה לא נמצאה" };
  }
  if ((article as any).is_draft) {
    await finish({ status: "failed", error: "הכתבה עדיין טיוטה" });
    return { id: item.id, ok: false, error: "הכתבה עדיין טיוטה" };
  }

  const wanted = item.kind === "story"
    ? item.platforms.filter((p) => p === "facebook" || p === "instagram")
    : item.platforms;
  const targets = accounts.filter((a) => a.enabled && wanted.includes(a.platform));
  if (targets.length === 0) {
    await finish({ status: "failed", error: "אין פלטפורמות פעילות מבין אלה שנבחרו" });
    return { id: item.id, ok: false, error: "אין פלטפורמות פעילות" };
  }

  const results = await publishTo(supabase, article as ArticleRow, targets, item.kind);
  const ok = results.some((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  await finish({
    status: ok ? "posted" : "failed",
    result: results,
    error: failed.length ? failed.map((f) => `${f.platform}: ${f.error}`).join(" · ").slice(0, 500) : null,
    posted_at: ok ? new Date().toISOString() : null,
  });
  return { id: item.id, article: (article as any).title, kind: item.kind, ok, results };
}

async function runDue(supabase: any, accounts: Account[], cap = 8): Promise<any[]> {
  const { data: due } = await supabase
    .from("social_queue")
    .select("id, article_id, platforms, kind, scheduled_at, status, source")
    .eq("status", "queued")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(cap);
  const out: any[] = [];
  for (const item of (due ?? []) as QueueRow[]) out.push(await runQueueItem(supabase, item, accounts));
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));

    const { data: accountsData, error: accErr } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("enabled", true);
    if (accErr) throw new Error(`טעינת חשבונות נכשלה: ${accErr.message}`);
    const accounts = (accountsData ?? []) as Account[];

    // ---------- cron sweep: fill free slots, then publish what is due ----------
    if (body?.auto) {
      const settings = await loadSettings(supabase);
      const autoAccounts = accounts.filter((a) => a.auto_publish);
      const filled = await fillQueue(supabase, settings, autoAccounts);
      const ran = await runDue(supabase, accounts);
      return json({ ok: true, auto: true, filled, ran });
    }

    // ---------- run one queue item now ----------
    if (body?.queueId) {
      const { data: item } = await supabase
        .from("social_queue")
        .select("id, article_id, platforms, kind, scheduled_at, status, source")
        .eq("id", String(body.queueId))
        .maybeSingle();
      if (!item) return json({ error: "הפריט לא נמצא בתור" }, 404);
      if (item.status !== "queued" && item.status !== "failed") return json({ error: `הפריט במצב ${item.status}` }, 409);
      if (item.status === "failed") {
        await supabase.from("social_queue").update({ status: "queued", error: null }).eq("id", item.id);
      }
      const result = await runQueueItem(supabase, item as QueueRow, accounts);
      return json({ ok: !!result.ok, ...result });
    }

    // ---------- manual, immediate ----------
    const articleId = String(body?.articleId || "");
    if (!articleId) return json({ error: "חסר מזהה כתבה" }, 400);
    const kind: "post" | "story" = body?.kind === "story" ? "story" : "post";

    const { data: article, error: artErr } = await supabase
      .from("articles")
      .select(ARTICLE_COLS)
      .eq("id", articleId)
      .single();
    if (artErr || !article) return json({ error: "הכתבה לא נמצאה" }, 404);

    const wanted: string[] = Array.isArray(body?.platforms) && body.platforms.length
      ? body.platforms
      : accounts.map((a) => a.platform);
    const targets = accounts.filter((a) => wanted.includes(a.platform) && (kind === "post" || a.platform === "facebook" || a.platform === "instagram"));
    if (targets.length === 0) return json({ error: "אין פלטפורמות מחוברות ופעילות לבקשה" }, 400);

    // Refuse silent duplicates unless explicitly forced.
    if (!body?.force) {
      const ledgerKeys = targets.map((a) => (kind === "story" ? `${a.platform}_story` : a.platform));
      const { data: existing } = await supabase
        .from("social_posts")
        .select("platform, status")
        .eq("article_id", articleId)
        .eq("status", "posted");
      const already = (existing ?? []).map((r: any) => r.platform).filter((p: string) => ledgerKeys.includes(p));
      if (already.length > 0) {
        return json(
          { error: `הכתבה כבר פורסמה ב: ${already.join(", ")}. סמן "פרסם שוב" כדי לפרסם בכל זאת.` },
          409,
        );
      }
    }

    const results = await publishTo(supabase, article as ArticleRow, targets, kind);
    return json({ ok: results.every((r) => r.ok), results });
  } catch (e: any) {
    console.error("social-publish error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
