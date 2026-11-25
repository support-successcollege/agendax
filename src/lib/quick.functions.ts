// Quick production ("הפקה מהירה"): the client side of the quick-article Edge
// Function. Types, the thin API, and the checklist the page shows live while
// the editor types.
//
// The server is the authority on everything here: it re-runs the same ten
// checks on publish and refuses a draft that fails one. The copy below exists
// only so the page can turn a row green without a round trip.
import { invokeEdge } from "@/lib/edge";

export type QuickNetwork = "facebook" | "instagram" | "linkedin";
export const QUICK_NETWORKS: QuickNetwork[] = [
  "facebook",
  "instagram",
  "linkedin",
];

export type QuickSource = {
  outlet: string;
  domain: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  origin: "pasted" | "google_news" | "bing_news" | "buffer";
  /** Read in full and given to the writer. A headline alone is never material. */
  read: boolean;
  note?: string;
};

export type QuickLimits = {
  titleMin: number;
  titleMax: number;
  excerptMin: number;
  excerptMax: number;
  bodyMinWords: number;
  minSubheads: number;
  minReviewScore: number;
  /** The shared stock photo: an article wearing it has no image of its own. */
  stockImage: string;
};

export type QuickContext = {
  /** Past this age a story goes to the site only; the networks refuse it. */
  maxStoryAgeHours: number;
  enabledPlatforms: QuickNetwork[];
  /** On: Facebook and Instagram posts get an automatic "הגיבו X" line at publish time. */
  dmAutomation: boolean;
  /** On: the LinkedIn post carries no link, and a fixed footer line is added. */
  linkedinLinkInComment: boolean;
  linkedin: { postedToday: number; cap: number; full: boolean };
  limits: QuickLimits;
  /** The next scheduled site build; until then crawlers get a 404 for a new article. */
  nextBuildAt: string;
};

export type QuickArticle = {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  imageUrl: string;
  isDraft: boolean;
  isBreaking: boolean;
  publishedAt: string | null;
  /** Opaque: sent back on publish exactly as received. Never parse it into a Date. */
  updatedAt: string;
  sourceUrl: string | null;
  sourcePublishedAt: string | null;
  reviewScore: number | null;
  reviewNote: string | null;
};

export type QuickUnsupported = { sentence: string; reason: string };
export type QuickOverlap = { outlet: string; snippet: string };
export type QuickTeasers = Partial<Record<QuickNetwork | "whatsapp", string>>;
export type QuickNetworkResult = {
  platform: string;
  state: "posted" | "failed" | "waiting" | "skipped";
  link: string | null;
  note: string | null;
};

export type QuickProductionStatus =
  | "drafting"
  | "ready"
  | "publishing"
  | "published"
  | "unpublished"
  | "failed"
  | "expired";

export type QuickDraft = {
  productionId: string;
  status: QuickProductionStatus;
  origin: "manual" | "auto";
  requestedTitle: string;
  createdAt: string;
  article: QuickArticle | null;
  sources: QuickSource[];
  outletsCount: number;
  readCount: number;
  singleSource: boolean;
  singleSourceNote: string | null;
  ageUnknown: boolean;
  unsupported: QuickUnsupported[];
  overlaps: QuickOverlap[];
  teasers: QuickTeasers;
  approvedTeasers: QuickTeasers;
  platforms: string[];
  results: QuickNetworkResult[] | null;
  error: string | null;
  context: QuickContext;
  keyFacts?: string[];
  /** Live stories on the same event from the last three days. */
  existing?: { title: string; slug: string; publishedAt: string | null }[];
};

export type QuickReview = {
  reviewScore: number;
  issues: string[];
  unsupported: QuickUnsupported[];
  singleSource: boolean;
  singleSourceNote: string | null;
  articleUpdatedAt: string | null;
};

export type QuickTeasersResult = { teasers: QuickTeasers; failed: string[] };
export type QuickImageResult = { imageUrl: string; articleUpdatedAt: string };

export type QuickPublishInput = {
  productionId: string;
  expectedUpdatedAt: string;
  title: string;
  excerpt: string;
  content: string;
  isBreaking: boolean;
  platforms: QuickNetwork[];
  teasers: QuickTeasers;
  acknowledgeSingleSource: boolean;
  acknowledgeUnsupported: boolean;
};

export type QuickPublishResult = {
  ok: true;
  articleId: string;
  slug: string;
  url: string;
  publishedAt: string;
  queueId: string | null;
  platforms: string[];
  skipped: { platform: string; reason: string }[];
  nextBuildAt: string;
};

export type QuickStatus = {
  productionId: string;
  status: QuickProductionStatus;
  live: boolean;
  slug: string | null;
  url: string | null;
  publishedAt: string | null;
  /** No queue row is still waiting or publishing. */
  done: boolean;
  networks: QuickNetworkResult[];
};

export type QuickRecent = {
  productionId: string;
  requestedTitle: string;
  status: QuickProductionStatus;
  origin: "manual" | "auto";
  singleSource: boolean;
  createdAt: string;
};

type TextInput = {
  productionId: string;
  title: string;
  excerpt: string;
  content: string;
};

export interface QuickApi {
  draft(input: { title: string; sourceUrls: string[] }): Promise<QuickDraft>;
  get(productionId: string): Promise<QuickDraft>;
  recent(): Promise<QuickRecent[]>;
  review(input: TextInput): Promise<QuickReview>;
  teasers(input: TextInput): Promise<QuickTeasersResult>;
  image(input: {
    productionId: string;
    imageUrl?: string;
  }): Promise<QuickImageResult>;
  publish(input: QuickPublishInput): Promise<QuickPublishResult>;
  status(productionId: string): Promise<QuickStatus>;
  retrySocial(productionId: string): Promise<{ ok: true }>;
  unpublish(productionId: string): Promise<{ ok: true }>;
}

const call = <T>(action: string, body: Record<string, unknown> = {}) =>
  invokeEdge<T>("quick-article", { action, ...body });

export const quickEdgeApi: QuickApi = {
  draft: (input) => call<QuickDraft>("draft", input),
  get: (productionId) => call<QuickDraft>("get", { productionId }),
  recent: async () => (await call<{ items: QuickRecent[] }>("recent")).items,
  review: (input) => call<QuickReview>("review", input),
  teasers: (input) => call<QuickTeasersResult>("teasers", input),
  image: (input) => call<QuickImageResult>("image", input),
  publish: (input) => call<QuickPublishResult>("publish", input),
  status: (productionId) => call<QuickStatus>("status", { productionId }),
  retrySocial: (productionId) =>
    call<{ ok: true }>("retry_social", { productionId }),
  unpublish: (productionId) =>
    call<{ ok: true }>("unpublish", { productionId }),
};

/**
 * `?mock=1` on a dev server swaps the Edge Function for canned data, so the
 * page can be worked on and checked without a login, a database write or a
 * model call. `import.meta.env.DEV` is a literal `false` in a production build,
 * so neither the switch nor the mock module can ship.
 */
export const isQuickMock = (): boolean =>
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("mock") === "1";

export async function loadQuickApi(): Promise<QuickApi> {
  if (import.meta.env.DEV && isQuickMock()) {
    const { quickMockApi } = await import("@/lib/quick.mock");
    return quickMockApi;
  }
  return quickEdgeApi;
}

// ---------------------------------------------------------------------------
// The checklist, as the page shows it
// ---------------------------------------------------------------------------

export type QuickCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const htmlToPlain = (html: string): string =>
  (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export const countWords = (html: string): number =>
  htmlToPlain(html).split(/\s+/).filter(Boolean).length;

/** Mirrors supabase/functions/_shared/quality.ts; the thresholds come from the server. */
export function auditQuick(
  article: Pick<
    QuickArticle,
    | "title"
    | "excerpt"
    | "content"
    | "slug"
    | "imageUrl"
    | "sourceUrl"
    | "reviewScore"
  >,
  limits: QuickLimits,
): QuickCheck[] {
  const title = article.title.trim();
  const excerpt = article.excerpt.trim();
  const content = article.content || "";
  const words = countWords(content);
  const subheads = (content.match(/<h[23]\b/gi) || []).length;
  const links = (content.match(/href="\/article\//g) || []).length;
  const image = (article.imageUrl || "").trim();
  const ownImage =
    !!image && image.split("?")[0] !== limits.stockImage.split("?")[0];

  const checks: QuickCheck[] = [
    {
      id: "title_length",
      label: `כותרת ${limits.titleMin}-${limits.titleMax} תווים`,
      ok: title.length >= limits.titleMin && title.length <= limits.titleMax,
      detail: `${title.length} תווים`,
    },
    {
      id: "excerpt_length",
      label: `תקציר ${limits.excerptMin}-${limits.excerptMax} תווים`,
      ok:
        excerpt.length >= limits.excerptMin &&
        excerpt.length <= limits.excerptMax,
      detail: `${excerpt.length} תווים`,
    },
    {
      id: "body_length",
      label: `גוף ${limits.bodyMinWords}+ מילים`,
      ok: words >= limits.bodyMinWords,
      detail: `${words} מילים`,
    },
    {
      id: "subheads",
      label: `${limits.minSubheads}+ כותרות משנה`,
      ok: subheads >= limits.minSubheads,
      detail: `${subheads} כותרות משנה`,
    },
    {
      id: "why_it_matters",
      label: 'סקשן "למה זה חשוב לך"',
      ok: /<h[23][^>]*>\s*למה זה חשוב/.test(content),
      detail: "הסקשן חסר",
    },
    {
      id: "internal_links",
      label: "קישור פנימי",
      ok: links >= 1,
      detail: "אין קישור לכתבה אחרת באתר",
    },
    {
      id: "source_link",
      label: "מקור מקושר",
      ok: !!(article.sourceUrl || "").trim(),
      detail: "אין מקור",
    },
    {
      id: "own_image",
      label: "תמונה משלה",
      ok: ownImage,
      detail: "עדיין תמונת ברירת המחדל",
    },
    {
      id: "slug",
      label: "כתובת קריאה",
      ok: !!article.slug && !UUID.test(article.slug),
      detail: "אין כתובת קריאה",
    },
    {
      id: "editor_review",
      label: `ביקורת עורך ${limits.minReviewScore}+`,
      ok: (article.reviewScore ?? 0) >= limits.minReviewScore,
      detail:
        article.reviewScore == null
          ? "עוד לא נבדקה"
          : `ציון ${article.reviewScore}/10`,
    },
  ];
  return checks;
}

/** Hours since the story broke, by the newest source read. */
export const storyAgeHours = (sourcePublishedAt: string | null): number =>
  sourcePublishedAt
    ? (Date.now() - Date.parse(sourcePublishedAt)) / 3_600_000
    : 0;
