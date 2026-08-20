// deno-lint-ignore-file no-explicit-any
// Publishes articles to the connected social networks — the one door for
// Instagram, Facebook, LinkedIn and X.
//
// Modes:
//   { articleId, platforms?: string[] }  — manual: post one article now to the
//     given platforms (default: every enabled one). Re-posting a platform that
//     already has a row for this article is refused unless force: true.
//   { auto: true }                       — the cron sweep: fresh published
//     articles (last 12h) that are missing a social_posts row are posted to
//     every platform with auto_publish on. Capped per run.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";
import {
  SITE_URL,
  generatePostText,
  publishFacebook,
  publishInstagram,
  publishLinkedIn,
  publishX,
  type ArticleForPost,
} from "../_shared/social.ts";
import { renderPostPng } from "../_shared/postImage.ts";

const PALETTE = ["#0d3c99", "#7c3aed", "#0f766e", "#be123c", "#b45309", "#166534", "#0e7490", "#9d174d"];
function categoryColor(key: string): string {
  const s = (key || "").trim().toLowerCase();
  if (!s) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * The branded post PNG (the Canva-template composition) for an article:
 * rendered server-side once, stored at article-images/social/{id}.png, and
 * reused ever after. Falls back to the raw article image if rendering fails —
 * a post with a plain photo beats no post.
 */
async function brandedImageUrl(supabase: any, article: ArticleRow): Promise<string> {
  const path = `social/${article.id}.png`;
  const publicUrl = supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;

  const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return publicUrl;

  try {
    const png = await renderPostPng({
      title: article.title,
      category: article.category,
      categoryColor: categoryColor(article.category_slug || article.category),
      photoUrl: article.image_url,
    });
    const { error } = await supabase.storage
      .from("article-images")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (error) throw error;
    return publicUrl;
  } catch (e) {
    console.error("branded image render failed, using article image:", (e as Error).message);
    return article.image_url;
  }
}

type Account = {
  platform: "facebook" | "instagram" | "linkedin" | "x";
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

const AUTO_WINDOW_MS = 12 * 60 * 60 * 1000;
const AUTO_CAP = 6;

async function publishOne(
  supabase: any,
  article: ArticleRow,
  account: Account,
): Promise<{ platform: string; ok: boolean; error?: string }> {
  const url = `${SITE_URL}/article/${encodeURIComponent(article.slug || article.id)}`;
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
      case "facebook":
        ({ externalId } = await publishFacebook(account.credentials, { text, link: url }));
        break;
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
      case "linkedin":
        ({ externalId } = await publishLinkedIn(account.credentials, { text, link: url }));
        break;
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

    // ---------- auto sweep ----------
    if (body?.auto) {
      const autoAccounts = accounts.filter((a) => a.auto_publish);
      if (autoAccounts.length === 0) return json({ ok: true, skipped: "אין פלטפורמות במצב אוטומטי" });

      const since = new Date(Date.now() - AUTO_WINDOW_MS).toISOString();
      const { data: fresh } = await supabase
        .from("articles")
        .select("id, slug, title, excerpt, category, category_slug, content, image_url")
        .eq("is_draft", false)
        .gte("published_at", since)
        .order("published_at", { ascending: true })
        .limit(30);

      const results: any[] = [];
      let budget = AUTO_CAP;
      for (const article of (fresh ?? []) as ArticleRow[]) {
        if (budget <= 0) break;
        const { data: existing } = await supabase
          .from("social_posts")
          .select("platform")
          .eq("article_id", article.id);
        const done = new Set((existing ?? []).map((r: any) => r.platform));
        for (const account of autoAccounts) {
          if (budget <= 0) break;
          if (done.has(account.platform)) continue;
          results.push({ article: article.title, ...(await publishOne(supabase, article, account)) });
          budget--;
        }
      }
      return json({ ok: true, auto: true, results });
    }

    // ---------- manual ----------
    const articleId = String(body?.articleId || "");
    if (!articleId) return json({ error: "חסר מזהה כתבה" }, 400);

    const { data: article, error: artErr } = await supabase
      .from("articles")
      .select("id, slug, title, excerpt, category, category_slug, content, image_url")
      .eq("id", articleId)
      .single();
    if (artErr || !article) return json({ error: "הכתבה לא נמצאה" }, 404);

    const wanted: string[] = Array.isArray(body?.platforms) && body.platforms.length
      ? body.platforms
      : accounts.map((a) => a.platform);
    const targets = accounts.filter((a) => wanted.includes(a.platform));
    if (targets.length === 0) return json({ error: "אין פלטפורמות מחוברות ופעילות לבקשה" }, 400);

    // Refuse silent duplicates unless explicitly forced.
    if (!body?.force) {
      const { data: existing } = await supabase
        .from("social_posts")
        .select("platform, status")
        .eq("article_id", articleId)
        .eq("status", "posted");
      const already = (existing ?? []).map((r: any) => r.platform).filter((p: string) => wanted.includes(p));
      if (already.length > 0) {
        return json(
          { error: `הכתבה כבר פורסמה ב: ${already.join(", ")}. סמן "פרסם שוב" כדי לפרסם בכל זאת.` },
          409,
        );
      }
    }

    const results = [];
    for (const account of targets) {
      results.push(await publishOne(supabase, article as ArticleRow, account));
    }
    return json({ ok: results.every((r) => r.ok), results });
  } catch (e: any) {
    console.error("social-publish error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
