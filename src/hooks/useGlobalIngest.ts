// Admin-side reads for the global hi-tech ingest pipeline.
//
// The Edge Functions do the writing; these hooks only read the tables behind
// them, which RLS already restricts to admins.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// A source's bucket is a site category slug (news_sources.bucket references
// categories.slug), so grouping labels come from the live categories table.
export type IngestBucket = string | null;

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

export interface IngestStats {
  publishedToday: number;
  queued: number;
  /** Per active category, not per site. */
  dailyTarget: number;
  queueBuffer: number;
  lookbackHours: number;
  categoryCount: number;
}

export interface CategoryStat {
  bucket: string;
  name: string;
  publishedToday: number;
  queued: number;
}

export const INGEST_KEYS = {
  sources: ["ingest", "sources"] as const,
  items: ["ingest", "items"] as const,
  runs: ["ingest", "runs"] as const,
  stats: ["ingest", "stats"] as const,
  categoryStats: ["ingest", "categoryStats"] as const,
};

/**
 * Today's progress against the daily target. The day boundary is Israel local
 * midnight and is computed inside the RPC, so the browser's clock and timezone
 * never enter into it.
 */
export const useIngestStats = () =>
  useQuery({
    queryKey: INGEST_KEYS.stats,
    queryFn: async (): Promise<IngestStats> => {
      const { data, error } = await supabase.rpc("ingest_daily_stats");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        publishedToday: row?.published_today ?? 0,
        queued: row?.queued ?? 0,
        dailyTarget: row?.daily_target ?? 10,
        queueBuffer: row?.queue_buffer ?? 3,
        lookbackHours: row?.lookback_hours ?? 24,
        categoryCount: row?.category_count ?? 1,
      };
    },
    refetchInterval: 30_000,
  });

/** Today's progress per active category, in the site's display order. */
export const useCategoryStats = () =>
  useQuery({
    queryKey: INGEST_KEYS.categoryStats,
    queryFn: async (): Promise<CategoryStat[]> => {
      const { data, error } = await supabase.rpc("ingest_category_stats");
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
        bucket: String(row.bucket),
        name: String(row.name),
        publishedToday: Number(row.published_today) || 0,
        queued: Number(row.queued) || 0,
      }));
    },
    refetchInterval: 30_000,
  });

export const updateDailyTarget = async (dailyTarget: number) => {
  const { error } = await supabase
    .from("ingest_config")
    .update({ daily_target: dailyTarget })
    .eq("id", true);
  if (error) throw error;
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
