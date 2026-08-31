import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Link2, Loader2, Save } from "lucide-react";
import {
  DEFAULT_SOCIAL_LINKS,
  SOCIAL_PLATFORMS,
  type SocialLinksMap,
  type SocialPlatform,
  saveSocialLinks,
  useRefreshSocialLinks,
  useSocialLinks,
} from "@/hooks/useSocialLinks";

/**
 * Edits the social buttons the readers see — the footer row and the floating
 * rail. Separate from the publishing credentials below it: this is where the
 * account links point, not how the system posts to them.
 */
const AdminSocialLinksCard = () => {
  const { toast } = useToast();
  const { data } = useSocialLinks();
  const refresh = useRefreshSocialLinks();
  const [links, setLinks] = useState<SocialLinksMap>(data ?? DEFAULT_SOCIAL_LINKS);
  const [saving, setSaving] = useState(false);

  // The stored value arrives after the first render; adopt it once.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (data && !hydrated) {
      setLinks(data);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const setLink = (platform: SocialPlatform, patch: Partial<{ url: string; enabled: boolean }>) =>
    setLinks((prev) => ({ ...prev, [platform]: { ...prev[platform], ...patch } }));

  const invalid = SOCIAL_PLATFORMS.filter(
    ({ key }) => links[key].enabled && !/^https?:\/\/\S+$/i.test(links[key].url.trim()),
  );

  const handleSave = async () => {
    if (invalid.length > 0) {
      toast({
        title: "כתובת לא תקינה",
        description: `${invalid.map((p) => p.label).join(", ")} — כתובת חייבת להתחיל ב-https://`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const trimmed = { ...links };
      for (const { key } of SOCIAL_PLATFORMS) trimmed[key] = { ...trimmed[key], url: trimmed[key].url.trim() };
      await saveSocialLinks(trimmed);
      setLinks(trimmed);
      refresh();
      toast({ title: "הקישורים נשמרו", description: "הכפתורים באתר מתעדכנים מיד." });
    } catch (error) {
      toast({
        title: "השמירה נכשלה",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          כפתורי הרשתות באתר
        </CardTitle>
        <CardDescription>
          לאן מובילים הכפתורים בתחתית האתר ובסרגל הצף. כיבוי המתג מסתיר את הכפתור לגמרי —
          רשת בלי כתובת לא מוצגת ממילא.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {SOCIAL_PLATFORMS.map(({ key, label, Icon, bg, placeholder }) => {
          const row = links[key];
          const bad = row.enabled && !!row.url.trim() && !/^https?:\/\/\S+$/i.test(row.url.trim());
          return (
            <div key={key} className="flex items-center gap-3">
              <span
                className={`${bg} w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white ${
                  row.enabled ? "" : "opacity-40 grayscale"
                }`}
                title={label}
              >
                <Icon className="w-4.5 h-4.5" />
              </span>
              <span className="w-24 shrink-0 text-sm font-medium hidden sm:block">{label}</span>
              <Input
                dir="ltr"
                placeholder={placeholder}
                value={row.url}
                onChange={(e) => setLink(key, { url: e.target.value })}
                className={`flex-1 ${bad ? "border-destructive" : ""}`}
                aria-label={`כתובת ${label}`}
              />
              <Switch
                checked={row.enabled}
                onCheckedChange={(v) => setLink(key, { enabled: v })}
                aria-label={`הצג את ${label} באתר`}
              />
            </div>
          );
        })}

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" className="gap-1.5" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            שמור קישורים
          </Button>
          <span className="text-xs text-muted-foreground">
            {SOCIAL_PLATFORMS.filter(({ key }) => links[key].enabled && links[key].url.trim()).length} כפתורים מוצגים באתר
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminSocialLinksCard;
