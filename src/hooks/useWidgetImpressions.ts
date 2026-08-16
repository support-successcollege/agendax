import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrackWidgetImpression = (widgetId: string | null) => {
  useEffect(() => {
    if (!widgetId) return;
    supabase.from("widget_impressions").insert({ widget_id: widgetId }).then(() => {});
  }, [widgetId]);
};

/** Records a click on a widget (fire-and-forget, never blocks navigation). */
export const useTrackWidgetClick = () => {
  return useCallback((widgetId: string | null | undefined) => {
    if (!widgetId) return;
    void (supabase.from("widget_clicks" as any).insert({ widget_id: widgetId } as any) as any).then(
      () => {},
      () => {}
    );
  }, []);
};

export const useWidgetViewCounts = () => {
  return useQuery({
    queryKey: ["widget-view-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_widget_view_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: { widget_id: string; view_count: number }) => {
        map[row.widget_id] = row.view_count;
      });
      return map;
    },
  });
};

export const useWidgetClickCounts = () => {
  return useQuery({
    queryKey: ["widget-click-counts"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_widget_click_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      ((data || []) as { widget_id: string; click_count: number }[]).forEach((row) => {
        map[row.widget_id] = Number(row.click_count);
      });
      return map;
    },
  });
};
