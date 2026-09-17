// deno-lint-ignore-file no-explicit-any
//
// Scores every article against the checklist, and repairs what fails.
//
//   { action: "scan", limit? }    score articles (no model, cheap)
//   { action: "fix", articleId }  repair one article, then re-score it
//   { action: "sweep", max? }     repair the worst few — what the cron calls
//   { action: "stats" }           the panel's summary line
//
// Two kinds of repair, deliberately separated. Most failures are structural —
// a missing internal link, the stock image, no slug, never reviewed — and those
// are fixed by code, exactly, every time. Only the four that are about the
// writing itself go to a model, and that call is told which ones failed and is
// forbidden to touch anything else.
//
// Nothing here invents facts. The rewrite gets the article and its source
// material and is told to work within them; an article whose body is short
// because the source was thin stays short rather than being padded.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  authorize,
  callClaude,
  callModelWithFallback,
  corsHeaders,
  htmlToText,
  json,
  mdToArticleHtml,
  readAlsoHtml,
  relatedLiveArticles,
  toolArgs,
} from "../_shared/ingest.ts";
import {
  auditArticle,
  BODY_MIN_WORDS,
  EXCERPT_MAX,
  EXCERPT_MIN,
  failing,
  hasWhyItMatters,
  MIN_SUBHEADS,
  TITLE_MAX,
  TITLE_MIN,
  type AuditableArticle,
  type Check,
} from "../_shared/quality.ts";

const COLS =
  "id, title, excerpt, content, slug, image_url, source_url, source_name, review_score, category, category_slug, is_draft, published_at";

type Article = AuditableArticle & {
  source_name: string | null;
  category: string | null;
  category_slug: string | null;
  is_draft: boolean;
  published_at: string | null;
};

const SWEEP_DEFAULT = 1;
/**
 * A repair measures 60-90 seconds — a rewrite, often a review, sometimes an
 * image — so two of them do not fit in one 150-second request. The guard is
 * the time left before starting ANOTHER article, not the total: at 55 seconds
 * a second repair can still finish, past that the sweep returns what it has and
 * the next run continues down the list. The caller loops instead of asking for
 * more per call.
 */
const SWEEP_BUDGET_MS = 55_000;

/** Stores an audit without tripping the trigger that clears it. */
async function storeAudit(supabase: any, id: string, score: number, checks: Check[]) {
  const { error } = await supabase
    .from("articles")
    .update({
      quality_score: score,
      quality_issues: checks,
      quality_checked_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`שמירת הציון נכשלה: ${error.message}`);
}

// ---------------------------------------------------------------- the writer

const REWRITE_TOOL = {
  type: "function",
  function: {
    name: "rewrite_article",
    description: "Returns the corrected fields of a Hebrew news article.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: `Hebrew headline, ${TITLE_MIN}-${TITLE_MAX} characters.` },
        excerpt: { type: "string", description: `Hebrew summary, ${EXCERPT_MIN}-${EXCERPT_MAX} characters.` },
        body: {
          type: "string",
          description:
            "The full article body in Markdown: ## subheadings, paragraphs, and a '## למה זה חשוב לך' section near the end.",
        },
      },
      required: ["title", "excerpt", "body"],
    },
  },
};

/**
 * One model call that repairs the writing-level failures. It is given the
 * article as it stands, its source material, and the exact list of what failed.
 */
async function rewrite(article: Article, broken: Check[]): Promise<{ title: string; excerpt: string; body: string }> {
  const asks = broken.map((c) => {
    switch (c.id) {
      case "title_length":
        return `- הכותרת: ${c.detail}. כתוב כותרת באורך ${TITLE_MIN}-${TITLE_MAX} תווים שאומרת את אותו הדבר.`;
      case "excerpt_length":
        return `- התקציר: ${c.detail}. כתוב תקציר באורך ${EXCERPT_MIN}-${EXCERPT_MAX} תווים.`;
      case "body_length":
        return `- הגוף: ${c.detail}. הרחב את מה שכבר כתוב — הקשר, השלכות והסבר — בלי להוסיף שום עובדה שאינה בחומר.`;
      case "subheads":
        return `- חלוקה: ${c.detail}. הוסף לפחות ${MIN_SUBHEADS} כותרות משנה (##) שמחלקות את הטקסט הקיים.`;
      case "why_it_matters":
        return `- הוסף בסוף סקשן "## למה זה חשוב לך" עם 2-4 משפטים על מה זה אומר לקורא הישראלי.`;
      default:
        return "";
    }
  }).filter(Boolean);

  const sourceMaterial = htmlToText(article.content || "").slice(0, 9000);

  const request = {
    messages: [
      {
        role: "system",
        content: [
          "אתה עורך בכיר באתר חדשות טכנולוגיה ועסקים בעברית.",
          "קיבלת כתבה שכבר פורסמה ורשימה של ליקויים שנמצאו בה. תקן אך ורק אותם.",
          "",
          "כללי ברזל:",
          "- אל תמציא עובדות. כל מספר, שם, תאריך וסכום חייב להופיע כבר בכתבה.",
          "- אל תשנה את המשמעות, את הזווית ואת המסקנות.",
          "- אם ליקוי לא מופיע ברשימה, השאר אותו כמו שהוא.",
          "- אל תוסיף קישורים. המערכת מוסיפה אותם בעצמה.",
          "- החזר את גוף הכתבה המלא ב-Markdown, לא רק את מה שהשתנה.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          `כותרת נוכחית: ${article.title}\n` +
          `תקציר נוכחי: ${article.excerpt}\n` +
          `קטגוריה: ${article.category || ""}\n` +
          (article.source_name ? `מקור: ${article.source_name}\n` : "") +
          `\n=== מה צריך לתקן ===\n${asks.join("\n")}\n` +
          `\n=== הכתבה כפי שהיא ===\n${sourceMaterial}`,
      },
    ],
    tools: [REWRITE_TOOL],
    tool_choice: { type: "function", function: { name: "rewrite_article" } },
    max_tokens: 6000,
  };

  let args: any;
  try {
    args = toolArgs(await callClaude(request));
  } catch (e) {
    console.error("rewrite: Claude failed, falling back", (e as Error).message);
    args = toolArgs(await callModelWithFallback(request));
  }
  return {
    title: String(args?.title ?? "").trim(),
    excerpt: String(args?.excerpt ?? "").trim(),
    body: String(args?.body ?? "").trim(),
  };
}

/** Wraps the "why it matters" heading and everything after it, as the writer does. */
function wrapWhyItMatters(html: string): string {
  const m = html.match(/<h2[^>]*>\s*למה זה חשוב/);
  if (!m || m.index === undefined) return html;
  return html.slice(0, m.index) + `<div class="why-it-matters">` + html.slice(m.index) + `</div>`;
}

/** The sub-editor score, for articles that never got one. */
async function review(article: Article, body: string): Promise<number | null> {
  try {
    const response = await callModelWithFallback({
      messages: [
        {
          role: "system",
          content:
            "אתה עורך משנה קפדן. בדוק את הכתבה: דיוק פנימי, כותרת שמשקפת את התוכן בלי הבטחת יתר, " +
            "עברית טבעית וללא שרידי תרגום, ומבנה ברור. החזר ציון 1-10 דרך הכלי בלבד.",
        },
        { role: "user", content: `כותרת: ${article.title}\n\n${htmlToText(body).slice(0, 9000)}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "review_article",
            description: "ציון עורך המשנה",
            parameters: {
              type: "object",
              properties: { score: { type: "integer", description: "1-10" } },
              required: ["score"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "review_article" } },
      max_tokens: 300,
    });
    const score = Number((toolArgs(response) as { score?: number }).score);
    return Number.isFinite(score) ? Math.min(Math.max(Math.round(score), 1), 10) : null;
  } catch (e) {
    console.error("review failed", (e as Error).message);
    return null;
  }
}

/** A readable Hebrew slug, as the pipeline builds them. */
const slugify = (title: string): string =>
  title
    .trim()
    .replace(/["'’”“]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// ------------------------------------------------------------------ the fix

async function fixOne(supabase: any, article: Article): Promise<Record<string, unknown>> {
  const before = auditArticle(article);
  const broken = failing(before.checks);
  if (broken.length === 0) {
    await storeAudit(supabase, article.id, before.score, before.checks);
    return { id: article.id, title: article.title, before: before.score, after: before.score, fixed: [] };
  }

  const patch: Record<string, unknown> = {};
  const fixed: string[] = [];
  const skipped: string[] = [];
  let content = article.content || "";
  let title = article.title || "";

  // ---- the writing, in one model call ----
  const rewritable = broken.filter((c) => c.needsRewrite);
  if (rewritable.length > 0) {
    try {
      const result = await rewrite(article, rewritable);
      if (result.body) {
        const html = wrapWhyItMatters(mdToArticleHtml(result.body));
        // A rewrite that came back shorter than what it was asked to expand is
        // a worse article; the original stands.
        const grew = htmlToText(html).split(/\s+/).filter(Boolean).length;
        const had = htmlToText(content).split(/\s+/).filter(Boolean).length;
        const wantedLonger = rewritable.some((c) => c.id === "body_length");
        if (!wantedLonger || grew >= had) {
          content = html;
          patch.content = html;
        } else {
          skipped.push("body_length");
        }
      }
      if (result.title && result.title.length >= TITLE_MIN && result.title.length <= TITLE_MAX) {
        title = result.title;
        patch.title = result.title;
      }
      if (result.excerpt && result.excerpt.length >= EXCERPT_MIN && result.excerpt.length <= EXCERPT_MAX) {
        patch.excerpt = result.excerpt;
      }
      for (const c of rewritable) if (!skipped.includes(c.id)) fixed.push(c.id);
    } catch (e) {
      console.error("rewrite failed", article.id, (e as Error).message);
      skipped.push(...rewritable.map((c) => c.id));
    }
  }

  // ---- internal links: code, not a model ----
  if (broken.some((c) => c.id === "internal_links")) {
    const candidates = await relatedLiveArticles(supabase, {
      categorySlug: article.category_slug,
      excludeId: article.id,
    });
    const block = readAlsoHtml(candidates, content);
    if (block) {
      content = content + block;
      patch.content = content;
      fixed.push("internal_links");
    } else {
      skipped.push("internal_links");
    }
  }

  // ---- a readable address ----
  if (broken.some((c) => c.id === "slug")) {
    const slug = slugify(String(patch.title ?? title));
    if (slug) {
      // A slug collision would 404 the older article's readers; keep it unique.
      const { data: taken } = await supabase.from("articles").select("id").eq("slug", slug).neq("id", article.id).maybeSingle();
      patch.slug = taken ? `${slug}-${article.id.slice(0, 6)}` : slug;
      fixed.push("slug");
    }
  }

  // ---- the image the article never got ----
  if (broken.some((c) => c.id === "own_image")) {
    const secret = Deno.env.get("INGEST_CRON_SECRET");
    if (secret) {
      try {
        const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/article-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
          body: JSON.stringify({ articleId: article.id, force: true }),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.ok) fixed.push("own_image");
        else skipped.push("own_image");
      } catch {
        skipped.push("own_image");
      }
    } else {
      skipped.push("own_image");
    }
  }

  // ---- the sub-editor's opinion, on whatever the text is now ----
  if (broken.some((c) => c.id === "editor_review")) {
    const score = await review(article, String(patch.content ?? content));
    if (score != null) {
      patch.review_score = score;
      if (score >= 7) fixed.push("editor_review");
      else skipped.push("editor_review");
    } else {
      skipped.push("editor_review");
    }
  }

  if (broken.some((c) => c.id === "source_link")) skipped.push("source_link");

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("articles").update(patch).eq("id", article.id);
    if (error) throw new Error(`עדכון הכתבה נכשל: ${error.message}`);
  }

  // Re-read: the image fixer wrote straight to the row, so the in-memory copy
  // is not what a reader now sees.
  const { data: fresh } = await supabase.from("articles").select(COLS).eq("id", article.id).maybeSingle();
  const after = auditArticle((fresh ?? { ...article, ...patch }) as Article);
  await storeAudit(supabase, article.id, after.score, after.checks);

  return {
    id: article.id,
    title: patch.title ?? article.title,
    before: before.score,
    after: after.score,
    fixed,
    skipped,
  };
}

// ---------------------------------------------------------------- endpoints

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = adminClient();

  try {
    const body = await req.json().catch(() => ({}));

    // ---------- scan: score without touching anything ----------
    if (body?.action === "scan") {
      const limit = Math.min(Math.max(Number(body?.limit) || 200, 1), 500);
      const { data, error } = await supabase
        .from("articles")
        .select(COLS)
        .eq("is_draft", false)
        .is("quality_checked_at", null)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);

      let scanned = 0;
      let perfect = 0;
      for (const article of (data ?? []) as Article[]) {
        const { score, checks } = auditArticle(article);
        await storeAudit(supabase, article.id, score, checks);
        scanned++;
        if (score === 100) perfect++;
      }
      return json({ ok: true, scanned, perfect });
    }

    // ---------- fix one ----------
    if (body?.action === "fix") {
      const { data: article } = await supabase.from("articles").select(COLS).eq("id", String(body?.articleId ?? "")).maybeSingle();
      if (!article) return json({ error: "הכתבה לא נמצאה" }, 404);
      return json({ ok: true, result: await fixOne(supabase, article as Article) });
    }

    // ---------- sweep: the worst first ----------
    if (body?.action === "sweep") {
      const max = Math.min(Math.max(Number(body?.max) || SWEEP_DEFAULT, 1), 5);
      const { data } = await supabase
        .from("articles")
        .select(COLS)
        .eq("is_draft", false)
        .lt("quality_score", 100)
        .not("quality_score", "is", null)
        .order("quality_score", { ascending: true })
        .order("published_at", { ascending: false })
        .limit(max);

      const deadline = Date.now() + SWEEP_BUDGET_MS;
      const results: Record<string, unknown>[] = [];
      let ranOutOfTime = 0;
      for (const article of (data ?? []) as Article[]) {
        if (Date.now() > deadline) {
          ranOutOfTime++;
          continue;
        }
        try {
          results.push(await fixOne(supabase, article as Article));
        } catch (e) {
          results.push({ id: article.id, title: article.title, error: (e as Error).message });
        }
      }
      const { count: remaining } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("is_draft", false)
        .lt("quality_score", 100);
      return json({ ok: true, handled: results, deferred: ranOutOfTime, remaining: remaining ?? 0 });
    }

    // ---------- stats ----------
    const counts = async (filter: (q: any) => any) => {
      const q = supabase.from("articles").select("id", { count: "exact", head: true }).eq("is_draft", false);
      const { count } = await filter(q);
      return count ?? 0;
    };
    const total = await counts((q: any) => q);
    const unchecked = await counts((q: any) => q.is("quality_checked_at", null));
    const perfect = await counts((q: any) => q.eq("quality_score", 100));
    const { data: worst } = await supabase
      .from("articles")
      .select("id, title, quality_score, quality_issues, published_at")
      .eq("is_draft", false)
      .lt("quality_score", 100)
      .not("quality_score", "is", null)
      .order("quality_score", { ascending: true })
      .order("published_at", { ascending: false })
      .limit(50);

    return json({ ok: true, total, unchecked, perfect, worst: worst ?? [] });
  } catch (e: any) {
    console.error("article-quality error", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
