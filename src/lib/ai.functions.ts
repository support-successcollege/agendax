// AI operations, executed in Supabase Edge Functions.
//
// These used to be TanStack `createServerFn` handlers. On a static host there is
// no server to run them, and the AI provider key must never reach the browser
// bundle, so each one is now a thin call to the matching Edge Function. The
// `{ data }` call shape is kept so component call sites stay unchanged.
import { invokeEdge } from "@/lib/edge";

export type GenerateArticleInput = { topic: string };

export type GeneratedArticle = {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  imageUrl: string;
  author: string;
  sources?: { title: string; url: string }[];
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
};

export const generateSocialPost = ({ data }: { data: SocialPostInput }) =>
  invokeEdge<{ post: string }>("generate-social-post", data);

export type WhatsappPostInput = Omit<SocialPostInput, "imageUrl">;

export const generateWhatsappPost = ({ data }: { data: WhatsappPostInput }) =>
  invokeEdge<{ post: string }>("generate-whatsapp-post", data);

// Called as `analyzeSite({ data: undefined })` — the parameter is accepted and
// ignored so the call site does not have to change.
export const analyzeSite = (_?: { data?: undefined }) =>
  invokeEdge<{ advice: string }>("analyze-site");
