import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Site-wide page view tracker. Records one row in `page_views` for every
 * page the visitor lands on (home, toolbox, jobs, courses, articles...).
 * Admin screens are skipped.
 */
const PageViewTracker = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin")) return;
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;

    const articleMatch = pathname.match(/^\/article\/([^/?#]+)/);
    const articleId = articleMatch ? decodeURIComponent(articleMatch[1]) : null;

    const track = async () => {
      try {
        const { error } = await supabase.from("page_views").insert({
          article_id: articleId,
          path: pathname,
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
        } as any);
        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: ["todayViews"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["periodViews"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["topPages"], refetchType: "active" });
        if (articleId) {
          queryClient.invalidateQueries({ queryKey: ["allArticleViews"], refetchType: "active" });
        }
      } catch (err) {
        console.error("Error tracking page view:", err);
      }
    };

    track();
  }, [pathname, queryClient]);

  return null;
};

export default PageViewTracker;
