import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/queries";

/**
 * Site-wide page view tracker. Records one row in `page_views` for every page
 * the visitor lands on. Admin screens are skipped.
 *
 * Visitor identity: a random id minted once per browser and kept in
 * localStorage. The browser exposes neither IP nor MAC; a persistent id is
 * the standard measure and truer than IP anyway (one office NAT = one IP,
 * many people).
 */

const VISITOR_KEY = "agendax_visitor_id";

const getVisitorId = (): string | null => {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null; // storage blocked (private mode) — the view still counts, anonymously
  }
};

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
    const articleKey = articleMatch ? decodeURIComponent(articleMatch[1]) : null;

    const track = async () => {
      try {
        // article_id is a uuid column; slug URLs must be resolved first —
        // inserting the slug used to fail the whole row, losing the view.
        let articleId: string | null = null;
        if (articleKey) {
          if (isUuid(articleKey)) {
            articleId = articleKey;
          } else {
            const { data } = await supabase
              .from("articles")
              .select("id")
              .eq("slug", articleKey)
              .maybeSingle();
            articleId = data?.id ?? null;
          }
        }

        const { error } = await supabase.from("page_views").insert({
          article_id: articleId,
          path: pathname,
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
          visitor_id: getVisitorId(),
        });
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
