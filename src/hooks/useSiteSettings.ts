import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSettings {
  show_jobs: boolean;
  show_courses: boolean;
}

const DEFAULTS: SiteSettings = { show_jobs: true, show_courses: true };
const KEY = ["siteSettings"] as const;

// React Query, not per-mount useState: the old version refetched on every
// mount with `true` defaults in the meantime, so each navigation flashed the
// full menu for a beat before the real settings arrived and links vanished.
// The shared cache makes later mounts render the known answer instantly.
export function useSiteSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<SiteSettings> => {
      const { data } = await supabase.from("site_settings").select("key,value");
      const next = { ...DEFAULTS };
      for (const row of (data ?? []) as { key: string; value: unknown }[]) {
        if (row.key in next) {
          (next as Record<string, boolean>)[row.key] = row.value === true || row.value === "true";
        }
      }
      return next;
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("site_settings_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_settings" },
        () => queryClient.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateSetting = useCallback(
    async (key: keyof SiteSettings, value: boolean) => {
      queryClient.setQueryData<SiteSettings>(KEY, (prev) => ({ ...(prev ?? DEFAULTS), [key]: value }));
      await supabase
        .from("site_settings")
        .upsert({ key, value: value as never, updated_at: new Date().toISOString() });
    },
    [queryClient],
  );

  return { settings: data ?? DEFAULTS, loading: isLoading, updateSetting };
}
