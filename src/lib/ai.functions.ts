// AI operations, executed in Supabase Edge Functions.
//
// These used to be TanStack `createServerFn` handlers. On a static host there is
// no server to run them, and the AI provider key must never reach the browser
// bundle, so each one is now a thin call to the matching Edge Function. The
// `{ data }` call shape is kept so component call sites stay unchanged.
import { invokeEdge } from "@/lib/edge";

export type GenerateArticleInput = {
  /** Free-text brief. Optional when sourceUrls are given. */
  topic?: string;
  /** Links the editor pasted; read in full and used as the primary material. */
  sourceUrls?: string[];
};

export type GeneratedArticle = {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  imageUrl: string;
  author: string;
  sources?: { title: string; url: string }[];
  /** Pasted links the server could not read (paywall, bot block). */
  unreadableUrls?: string[];
};

export const generateArticle = ({ data }: { data: GenerateArticleInput }) =>
  invokeEdge<GeneratedArticle>("generate-article", data);

export type VerifyArticleInput = { title: string; content: string };

export type VerificationResult = {
  overallScore: number;
  isReliable: boolean;
  summary: string;
  issues: string[];
  suggestions: string[];
  factChecks: {
    claim: string;
    status: "verified" | "unverified" | "false" | "needs_context";
    explanation: string;
  }[];
};

export const verifyArticle = ({ data }: { data: VerifyArticleInput }) =>
  invokeEdge<VerificationResult>("verify-article", data);

export type SocialPostInput = {
  title: string;
  excerpt: string;
  category: string;
  url: string;
  content: string;
  imageUrl?: string;
  /** Target network — tunes tone and length. Default facebook. */
  platform?: "facebook" | "linkedin" | "twitter" | "instagram" | "whatsapp";
};

export type SocialPostResult = {
  post: string;
  articleUrl: string;
  imageUrl: string | null;
  platform: string;
  hashtags: string[];
};

export const generateSocialPost = ({ data }: { data: SocialPostInput }) =>
  invokeEdge<SocialPostResult>("generate-social-post", data);

export type WhatsappPostInput = Omit<SocialPostInput, "imageUrl">;

export const generateWhatsappPost = ({ data }: { data: WhatsappPostInput }) =>
  invokeEdge<{ post: string }>("generate-whatsapp-post", data);

// Called as `analyzeSite({ data: undefined })` — the parameter is accepted and
// ignored so the call site does not have to change.
export const analyzeSite = (_?: { data?: undefined }) =>
  invokeEdge<{ advice: string }>("analyze-site");

// --- Global hi-tech ingest ---------------------------------------------------
// Two Edge Functions, called on a schedule by pg_cron and on demand from the
// admin panel. The split (scan vs write) is what keeps each invocation inside
// its wall-clock budget — see supabase/functions/ingest-global-tech.

export type IngestScanInput = {
  /** How many stories the ranker may queue. Default 4. */
  limit?: number;
  lookbackHours?: number;
  /** Fetch and report on the feeds without ranking or queueing anything. */
  dryRun?: boolean;
  buckets?: string[];
};

export type IngestScanResult = {
  ok?: boolean;
  dryRun?: boolean;
  /** Set when the scan returned early because today's target is already met. */
  skipped?: string;
  publishedToday?: number;
  dailyTarget?: number;
  sources?: { name: string; ok: boolean; items: number; error?: string }[];
  itemsSeen?: number;
  itemsNew?: number;
  queued?: number;
  picks?: { source: string; title: string; priority: number; angle: string }[];
  sample?: { source: string; title: string; url: string }[];
  durationMs?: number;
};

export const scanGlobalTech = ({ data }: { data?: IngestScanInput } = {}) =>
  invokeEdge<IngestScanResult>("ingest-global-tech", data ?? {});

export type IngestWorkerResult = {
  ok: boolean;
  created: { id: string; title: string }[];
  remaining: number;
  /** Set when the worker declined to write because the daily target is met. */
  skipped?: string;
  publishedToday?: number;
  dailyTarget?: number;
  notes: string[];
  durationMs: number;
};

export const runIngestWorker = ({ data }: { data?: { max?: number } } = {}) =>
  invokeEdge<IngestWorkerResult>("ingest-worker", data ?? {});
