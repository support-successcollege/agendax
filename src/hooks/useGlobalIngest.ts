// Admin-side reads for the global hi-tech ingest pipeline.
//
// The Edge Functions do the writing; these hooks only read the tables behind
// them, which RLS already restricts to admins.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type IngestBucket = "general" | "ai" | "business" | "dev";

export const BUCKET_LABELS: Record<IngestBucket, string> = {
  general: "טק כללי",
  ai: "AI ומחקר",
  business: "עסקים והון סיכון",
  dev: "מפתחים וסטארטאפים",
};

export interface NewsSource {
  id: string;
  name: string;
  feed_url: string;
  homepage: string | null;
  bucket: IngestBucket;
  weight: number;
  is_active: boolean;
  last_fetched_at: string | null;
  last_status: string | null;
  last_item_count: number;
}

export type IngestStatus = "seen" | "pending" | "processing" | "published" | "failed" | "skipped";

export interface IngestItem {
  id: string;
  url: string;
  source_name: string;
  source_title: string;
  source_published_at: string | null;
  bucket: string | null;
  status: IngestStatus;
  priority: number;
  angle: string | null;
  attempts: number;
  error: string | null;
  article_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestRun {
  id: string;
  kind: "scan" | "worker";
  trigger: string;
  sources_ok: number;
  sources_failed: number;
  items_seen: number;
  items_new: number;
  items_queued: number;
  articles_created: number;
  notes: string[];
  duration_ms: number | null;
  created_at: string;
}

export const INGEST_KEYS = {
  sources: ["ingest", "sources"] as const,
  items: ["ingest", "items"] as const,
  runs: ["ingest", "runs"] as const,
};

export const useNewsSources = () =>
  useQuery({
    queryKey: INGEST_KEYS.sources,
    queryFn: async (): Promise<NewsSource[]> => {
      const { data, error } = await supabase
        .from("news_sources")
        .select("*")
        .order("bucket", { ascending: true })
        .order("weight", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsSource[];
    },
  });

/** Everything except the long tail of `seen` rows, which is just noise. */
export const useIngestItems = () =>
  useQuery({
    queryKey: INGEST_KEYS.items,
    queryFn: async (): Promise<IngestItem[]> => {
      const { data, error } = await supabase
        .from("ingest_items")
        .select("*")
        .neq("status", "seen")
        .order("updated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as IngestItem[];
    },
    refetchInterval: 30_000,
  });

export const useIngestRuns = () =>
  useQuery({
    queryKey: INGEST_KEYS.runs,
    queryFn: async (): Promise<IngestRun[]> => {
      const { data, error } = await supabase
        .from("ingest_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      // `notes` is a jsonb column, so normalise it to the string[] the UI expects
      // instead of trusting the shape that comes back.
      return (data ?? []).map((row) => ({
        ...row,
        notes: Array.isArray(row.notes) ? row.notes.map((n) => String(n)) : [],
      })) as IngestRun[];
    },
    refetchInterval: 30_000,
  });

export const useRefreshIngest = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["ingest"] });
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };
};
