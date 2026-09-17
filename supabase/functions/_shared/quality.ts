// The checklist every article is measured against.
//
// Each criterion is a yes/no an editor could verify by hand, and each one has a
// repair. That pairing is the point: a score nobody can act on is decoration,
// so nothing goes on this list unless the fixer knows what to do about it.
//
// Thresholds are the ones the SEO audit asked for, checked against the archive
// as it actually is rather than chosen from a blog post.
import { FALLBACK_IMAGE, htmlToText } from "./ingest.ts";

export type CheckId =
  | "title_length"
  | "excerpt_length"
  | "body_length"
  | "subheads"
  | "internal_links"
  | "source_link"
  | "own_image"
  | "why_it_matters"
  | "slug"
  | "editor_review";

export type Check = {
  id: CheckId;
  label: string;
  ok: boolean;
  /** What is wrong, in the words the panel shows. Empty when the check passed. */
  detail: string;
  /** Only a model can repair these; the rest are fixed deterministically. */
  needsRewrite: boolean;
};

export type AuditableArticle = {
  id: string;
  title: string | null;
  excerpt: string | null;
  content: string | null;
  slug: string | null;
  image_url: string | null;
  source_url: string | null;
  review_score: number | null;
};

export const TITLE_MIN = 45;
export const TITLE_MAX = 70;
export const EXCERPT_MIN = 110;
export const EXCERPT_MAX = 160;
export const BODY_MIN_WORDS = 350;
export const MIN_SUBHEADS = 2;
export const MIN_REVIEW_SCORE = 7;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const wordCount = (html: string): number =>
  htmlToText(html).split(/\s+/).filter(Boolean).length;

export const subheadCount = (html: string): number =>
  (html.match(/<h[23]\b/gi) || []).length;

export const internalLinkCount = (html: string): number =>
  (html.match(/href="\/article\//g) || []).length;

export const hasWhyItMatters = (html: string): boolean =>
  /<h[23][^>]*>\s*למה זה חשוב/.test(html);

/** True for the shared stock photo — an article wearing it has no image of its own. */
export const isStockImage = (url: string | null): boolean => {
  const u = (url || "").trim();
  if (!u) return true;
  const stock = FALLBACK_IMAGE.split("?")[0];
  return u.split("?")[0] === stock;
};

export function auditArticle(article: AuditableArticle): { score: number; checks: Check[] } {
  const title = (article.title || "").trim();
  const excerpt = (article.excerpt || "").trim();
  const content = article.content || "";
  const words = wordCount(content);
  const subheads = subheadCount(content);
  const links = internalLinkCount(content);

  const checks: Check[] = [
    {
      id: "title_length",
      label: `אורך כותרת ${TITLE_MIN}-${TITLE_MAX} תווים`,
      ok: title.length >= TITLE_MIN && title.length <= TITLE_MAX,
      detail: title.length < TITLE_MIN ? `${title.length} תווים — קצרה מדי` : `${title.length} תווים — ארוכה מדי, גוגל יחתוך אותה`,
      needsRewrite: true,
    },
    {
      id: "excerpt_length",
      label: `תקציר ${EXCERPT_MIN}-${EXCERPT_MAX} תווים`,
      ok: excerpt.length >= EXCERPT_MIN && excerpt.length <= EXCERPT_MAX,
      detail: excerpt.length < EXCERPT_MIN ? `${excerpt.length} תווים — קצר מדי לתיאור בגוגל` : `${excerpt.length} תווים — ייחתך בתוצאות`,
      needsRewrite: true,
    },
    {
      id: "body_length",
      label: `גוף הכתבה ${BODY_MIN_WORDS}+ מילים`,
      ok: words >= BODY_MIN_WORDS,
      detail: `${words} מילים — חסרות ${Math.max(0, BODY_MIN_WORDS - words)}`,
      needsRewrite: true,
    },
    {
      id: "subheads",
      label: `${MIN_SUBHEADS}+ כותרות משנה`,
      ok: subheads >= MIN_SUBHEADS,
      detail: `${subheads} כותרות משנה — הטקסט רץ בלי חלוקה`,
      needsRewrite: true,
    },
    {
      id: "why_it_matters",
      label: 'סקשן "למה זה חשוב לך"',
      ok: hasWhyItMatters(content),
      detail: "אין את הסקשן שמסביר לקורא מה זה אומר לו",
      needsRewrite: true,
    },
    {
      id: "internal_links",
      label: "קישור פנימי לכתבה אחרת",
      ok: links >= 1,
      detail: "אין קישור פנימי — הכתבה לא מחזיקה את הקורא באתר",
      needsRewrite: false,
    },
    {
      id: "source_link",
      label: "קישור למקור",
      ok: !!(article.source_url || "").trim(),
      detail: "אין מקור מקושר",
      needsRewrite: false,
    },
    {
      id: "own_image",
      label: "תמונה משלה",
      ok: !isStockImage(article.image_url),
      detail: "תמונת ברירת המחדל — לא קשורה לכתבה",
      needsRewrite: false,
    },
    {
      id: "slug",
      label: "כתובת קריאה",
      ok: !!article.slug && !UUID.test(article.slug),
      detail: "אין slug קריא — הכתובת היא מזהה מקרי",
      needsRewrite: false,
    },
    {
      id: "editor_review",
      label: `ביקורת עורך ${MIN_REVIEW_SCORE}+`,
      ok: (article.review_score ?? 0) >= MIN_REVIEW_SCORE,
      detail: article.review_score == null ? "לא נבדקה על ידי עורך המשנה" : `ציון ${article.review_score}/10`,
      needsRewrite: false,
    },
  ];

  for (const check of checks) if (check.ok) check.detail = "";
  const passed = checks.filter((c) => c.ok).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}

export const failing = (checks: Check[]): Check[] => checks.filter((c) => !c.ok);
