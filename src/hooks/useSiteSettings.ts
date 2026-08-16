import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSettings {
  show_jobs: boolean;
  show_courses: boolean;
}

const DEFAULTS: SiteSettings = { show_jobs: true, show_courses: true };

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("site_settings").select("key,value");
    if (data) {
      const next = { ...DEFAULTS };
      for (const row of data as { key: string; value: any }[]) {
        if (row.key in next) {
          (next as any)[row.key] = row.value === true || row.value === "true";
        }
      }
      setSettings(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("site_settings_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const updateSetting = useCallback(async (key: keyof SiteSettings, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: value }));
    await supabase.from("site_settings").upsert({ key, value: value as any, updated_at: new Date().toISOString() });
  }, []);

  return { settings, loading, updateSetting };
}
