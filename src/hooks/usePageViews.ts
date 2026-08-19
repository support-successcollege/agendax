import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Track a page view for an article
export const useTrackPageView = (articleId: string | undefined) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!articleId) return;

    const trackView = async () => {
      try {
        const referrer = document.referrer || null;
        const { error } = await supabase.from("page_views").insert({
          article_id: articleId,
          user_agent: navigator.userAgent,
          referrer: referrer,
        } as any);

        if (error) throw error;

        queryClient.invalidateQueries({
          queryKey: ["todayViews"],
          refetchType: "active",
        });
        queryClient.invalidateQueries({
          queryKey: ["allArticleViews"],
          refetchType: "active",
        });
      } catch (error) {
        console.error("Error tracking page view:", error);
      }
    };

    trackView();
  }, [articleId, queryClient]);
};

// Get today's view count with React Query
export const useTodayViewCount = () => {
  const { data: todayViews = 0, isLoading, refetch } = useQuery({
    queryKey: ["todayViews"],
    queryFn: async (): Promise<number> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count, error } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .gte("viewed_at", today.toISOString());

      if (error) {
        console.error("Error getting today's views:", error);
        return 0;
      }
      return count || 0;
    },
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  return { todayViews, isLoading, refetch };
};

// Get views for all articles using DB function (no 1000 row limit)
export const useAllArticleViews = () => {
  const { data: articleViews = {}, isLoading } = useQuery({
    queryKey: ["allArticleViews"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("get_article_view_counts");

      if (error) {
        console.error("Error getting all article views:", error);
        return {};
      }

      const counts: Record<string, number> = {};
      data?.forEach((row: any) => {
        if (row.article_id) {
          counts[row.article_id] = Number(row.view_count);
        }
      });
      return counts;
    },
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnMount: "always",
  });

  return { articleViews, isLoading };
};

// The hot list: views inside a sliding window (48h), refreshed every minute,
// so the table reshuffles live as stories rise and fade through the day.
export const useHotArticles = (hours = 48, limit = 10) => {
  const { data: hot = [], isLoading } = useQuery({
    queryKey: ["hotArticles", hours, limit],
    queryFn: async (): Promise<{ articleId: string; views: number }[]> => {
      const { data, error } = await supabase.rpc("get_hot_articles", {
        p_hours: hours,
        p_limit: limit,
      });
      if (error) {
        console.error("Error getting hot articles:", error);
        return [];
      }
      return (data ?? []).map((row: { article_id: string; views: number }) => ({
        articleId: row.article_id,
        views: Number(row.views),
      }));
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return { hot, isLoading };
};

// Get view count for a specific period
export const usePeriodViewCount = () => {
  const { data: periodViews = { week: 0, month: 0, allTime: 0 }, isLoading } = useQuery({
    queryKey: ["periodViews"],
    queryFn: async () => {
      const now = new Date();
      
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      monthAgo.setHours(0, 0, 0, 0);

      const [weekRes, monthRes, allRes] = await Promise.all([
        supabase.from("page_views").select("*", { count: "exact", head: true }).gte("viewed_at", weekAgo.toISOString()),
        supabase.from("page_views").select("*", { count: "exact", head: true }).gte("viewed_at", monthAgo.toISOString()),
        supabase.from("page_views").select("*", { count: "exact", head: true }),
      ]);

      return {
        week: weekRes.count || 0,
        month: monthRes.count || 0,
        allTime: allRes.count || 0,
      };
    },
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnMount: "always",
  });

  return { periodViews, isLoading };
};

// ---- Date range helpers for the "top pages" report ----
export type ViewRangePreset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const getRangeBounds = (
  preset: ViewRangePreset,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } => {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  switch (preset) {
    case "today":
      return { from: today.toISOString(), to: tomorrow.toISOString() };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y.toISOString(), to: today.toISOString() };
    }
    case "week": {
      const w = new Date(today);
      w.setDate(w.getDate() - 6);
      return { from: w.toISOString(), to: tomorrow.toISOString() };
    }
    case "month": {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: m.toISOString(), to: tomorrow.toISOString() };
    }
    case "lastMonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    case "custom":
    default: {
      const s = customFrom ? startOfDay(new Date(customFrom)) : today;
      const eBase = customTo ? startOfDay(new Date(customTo)) : today;
      const e = new Date(eBase);
      e.setDate(e.getDate() + 1);
      return { from: s.toISOString(), to: e.toISOString() };
    }
  }
};

// Top viewed pages (by path) for a given date range
export const useTopPages = (from?: string, to?: string) => {
  const defaults = (() => {
    if (from && to) return { from, to };
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 1);
    return { from: since.toISOString(), to: end.toISOString() };
  })();

  const { data: topPages = [], isLoading } = useQuery({
    queryKey: ["topPages", defaults.from, defaults.to],
    queryFn: async (): Promise<{ path: string; count: number }[]> => {
      const { data, error } = await supabase
        .from("page_views")
        .select("path")
        .gte("viewed_at", defaults.from)
        .lt("viewed_at", defaults.to)
        .not("path", "is", null)
        .limit(50000);

      if (error) {
        console.error("Error getting top pages:", error);
        return [];
      }

      const counts = new Map<string, number>();
      (data ?? []).forEach((row: any) => {
        if (!row.path) return;
        counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
      });

      return Array.from(counts.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 60000,
  });

  return { topPages, isLoading };
};

// Map a page path to a human-friendly name
const STATIC_PATH_NAMES: Record<string, string> = {
  "/": "דף הבית",
  "/toolbox": "ארגז הכלים",
  "/about": "אודות",
  "/courses": "קורסים והרצאות",
  "/courses/account": "חשבון תלמיד",
  "/jobs": "איזור התעסוקה",
  "/privacy": "מדיניות פרטיות",
  "/terms": "תקנון",
  "/accessibility": "הצהרת נגישות",
  "/auth": "התחברות",
  "/reset-password": "איפוס סיסמה",
};

export const usePathNames = () => {
  const { data: maps } = useQuery({
    queryKey: ["pathNameMaps"],
    queryFn: async () => {
      const db: any = supabase;
      const [articles, courses, events, jobs] = await Promise.all([
        db.from("articles").select("id, title"),
        db.from("courses").select("slug, title"),
        db.from("events").select("slug, title"),
        db.from("jobs").select("id, title"),
      ]);
      const build = (rows: any[] | null, key: string) => {
        const m: Record<string, string> = {};
        (rows ?? []).forEach((r: any) => {
          if (r?.[key]) m[String(r[key])] = r.title ?? "";
        });
        return m;
      };
      return {
        articles: build(articles.data, "id"),
        courses: build(courses.data, "slug"),
        events: build(events.data, "slug"),
        jobs: build(jobs.data, "id"),
      };
    },
    staleTime: 5 * 60_000,
  });

  const resolvePathName = (path: string): string | null => {
    const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
    if (STATIC_PATH_NAMES[clean]) return STATIC_PATH_NAMES[clean];

    const patterns: [RegExp, Record<string, string> | undefined, string][] = [
      [/^\/article\/(.+)$/, maps?.articles, "כתבה"],
      [/^\/courses\/(.+)$/, maps?.courses, "קורס"],
      [/^\/events\/(.+)$/, maps?.events, "אירוע"],
      [/^\/jobs\/(.+)$/, maps?.jobs, "משרה"],
    ];

    for (const [re, map, prefix] of patterns) {
      const m = clean.match(re);
      if (m) {
        const title = map?.[decodeURIComponent(m[1])];
        return title ? `${prefix}: ${title}` : null;
      }
    }
    return null;
  };

  return { resolvePathName };
};


// Get new articles count from today
export const useTodayNewArticles = () => {
  const { data: todayNewArticles = 0, isLoading, refetch } = useQuery({
    queryKey: ["todayNewArticles"],
    queryFn: async (): Promise<number> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count, error } = await supabase
        .from("articles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      if (error) {
        console.error("Error getting today's new articles:", error);
        return 0;
      }
      return count || 0;
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  return { todayNewArticles, isLoading, refetch };
};

// Get stats for a specific article
export const useArticleStats = (articleId: string | undefined) => {
  const { data: referrerStats = [], isLoading: isReferrerLoading } = useQuery({
    queryKey: ["articleStats", articleId],
    queryFn: async () => {
      if (!articleId) return [];
      const { data, error } = await supabase.rpc("get_article_stats", {
        p_article_id: articleId,
      });
      if (error) {
        console.error("Error getting article stats:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!articleId,
  });

  const { data: dailyViews = [], isLoading: isDailyLoading } = useQuery({
    queryKey: ["articleDailyViews", articleId],
    queryFn: async () => {
      if (!articleId) return [];
      const { data, error } = await supabase.rpc("get_article_daily_views", {
        p_article_id: articleId,
      });
      if (error) {
        console.error("Error getting daily views:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!articleId,
  });

  return {
    referrerStats,
    dailyViews,
    isLoading: isReferrerLoading || isDailyLoading,
  };
};
