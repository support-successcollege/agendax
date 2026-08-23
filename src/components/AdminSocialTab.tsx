import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge";
import { useArticles } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Share2,
  Loader2,
  Save,
  Send,
  CheckCircle2,
  XCircle,
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  History,
} from "lucide-react";

type Platform = "facebook" | "instagram" | "linkedin" | "x";

interface AccountRow {
  platform: Platform;
  enabled: boolean;
  auto_publish: boolean;
  credentials: Record<string, string>;
}

interface PostRow {
  id: string;
  article_id: string;
  platform: string;
  status: "pending" | "posted" | "failed";
  post_text: string | null;
  error: string | null;
  created_at: string;
}

// What each platform needs, and where to get it — the field list drives the
// form, so adding a credential later is one entry here.
const PLATFORM_META: Record<
  Platform,
  { label: string; Icon: typeof Facebook; color: string; fields: { key: string; label: string; hint?: string }[]; help: string }
> = {
  facebook: {
    label: "פייסבוק",
    Icon: Facebook,
    color: "#1877F2",
    fields: [
      { key: "page_id", label: "Page ID" },
      { key: "access_token", label: "Page Access Token" },
    ],
    help: "developers.facebook.com → אפליקציה → Page Access Token ארוך-טווח עם הרשאות pages_manage_posts.",
  },
  instagram: {
    label: "אינסטגרם",
    Icon: Instagram,
    color: "#DD2A7B",
    fields: [
      { key: "ig_user_id", label: "IG Business User ID" },
      { key: "access_token", label: "Access Token" },
    ],
    help: "חשבון Business מקושר לעמוד פייסבוק; אותו טוקן של העמוד עובד. פרסום דורש תמונה — נלקחת מהכתבה.",
  },
  linkedin: {
    label: "לינקדאין",
    Icon: Linkedin,
    color: "#0A66C2",
    fields: [
      { key: "author_urn", label: "Author URN", hint: "urn:li:person:xxx או urn:li:organization:xxx" },
      { key: "access_token", label: "Access Token" },
    ],
    help: "אפליקציה ב-developer.linkedin.com עם הרשאת w_member_social (פרופיל) או w_organization_social (עמוד חברה).",
  },
  x: {
    label: "X (טוויטר)",
    Icon: Twitter,
    color: "#000000",
    fields: [
      { key: "api_key", label: "API Key", hint: "Consumer Keys" },
      { key: "api_secret", label: "API Key Secret" },
      { key: "access_token", label: "Access Token", hint: "עם Read and Write" },
      { key: "access_secret", label: "Access Token Secret" },
    ],
    help: "developer.x.com → האפליקציה → Keys and tokens. ודא ש-App permissions הוא Read and Write לפני הפקת ה-Access Token (אם הופק לפני — Regenerate). ארבעת המפתחות לא פגים. לא ה-Bearer Token — הוא לקריאה בלבד.",
  },
};

const PLATFORMS = Object.keys(PLATFORM_META) as Platform[];

// Ledger rows the publisher writes beside the main post (the 9:16 story that
// rides behind every Facebook / Instagram post).
const EXTRA_LABELS: Record<string, string> = {
  facebook_story: "סטורי פייסבוק",
  instagram_story: "סטורי אינסטגרם",
};

const AdminSocialTab = () => {
  const { toast } = useToast();
  const { articles } = useArticles();
  const [accounts, setAccounts] = useState<Record<Platform, AccountRow>>(() =>
    Object.fromEntries(
      PLATFORMS.map((p) => [p, { platform: p, enabled: false, auto_publish: false, credentials: {} }]),
    ) as Record<Platform, AccountRow>,
  );
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [savingPlatform, setSavingPlatform] = useState<Platform | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Manual publish state
  const [publishArticleId, setPublishArticleId] = useState("");
  const [publishTargets, setPublishTargets] = useState<Platform[]>([]);
  const [forceRepost, setForceRepost] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const recentPublished = articles.filter((a) => !a.isDraft).slice(0, 20);
  const articleTitle = (id: string) => articles.find((a) => a.id === id)?.title ?? "כתבה שנמחקה";

  const fetchAll = useCallback(async () => {
    const [accRes, postsRes] = await Promise.all([
      supabase.from("social_accounts").select("*"),
      supabase.from("social_posts").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    if (accRes.data) {
      setAccounts((prev) => {
        const next = { ...prev };
        for (const row of accRes.data as AccountRow[]) {
          next[row.platform] = { ...row, credentials: row.credentials ?? {} };
        }
        return next;
      });
    }
    setPosts((postsRes.data ?? []) as PostRow[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const saveAccount = async (platform: Platform) => {
    setSavingPlatform(platform);
    const row = accounts[platform];
    const { error } = await supabase.from("social_accounts").upsert(
      {
        platform,
        enabled: row.enabled,
        auto_publish: row.auto_publish,
        credentials: row.credentials,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform" },
    );
    setSavingPlatform(null);
    if (error) {
      toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `הגדרות ${PLATFORM_META[platform].label} נשמרו` });
  };

  const setAccount = (platform: Platform, patch: Partial<AccountRow>) =>
    setAccounts((prev) => ({ ...prev, [platform]: { ...prev[platform], ...patch } }));

  const handlePublish = async () => {
    if (!publishArticleId) {
      toast({ title: "בחר כתבה לפרסום", variant: "destructive" });
      return;
    }
    if (publishTargets.length === 0) {
      toast({ title: "בחר לפחות פלטפורמה אחת", variant: "destructive" });
      return;
    }
    setIsPublishing(true);
    try {
      const result = await invokeEdge<{ ok: boolean; results: { platform: string; ok: boolean; error?: string }[] }>(
        "social-publish",
        { articleId: publishArticleId, platforms: publishTargets, force: forceRepost },
      );
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast({ title: "פורסם!", description: result.results.map((r) => PLATFORM_META[r.platform as Platform]?.label ?? r.platform).join(", ") });
      } else {
        toast({
          title: "פורסם חלקית",
          description: failed.map((f) => `${PLATFORM_META[f.platform as Platform]?.label}: ${f.error}`).join(" · ").slice(0, 300),
          variant: "destructive",
        });
      }
      fetchAll();
    } catch (error) {
      toast({
        title: "הפרסום נכשל",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const enabledPlatforms = PLATFORMS.filter((p) => accounts[p].enabled);

  return (
    <div className="space-y-6">
      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            חיבור רשתות חברתיות
          </CardTitle>
          <CardDescription>
            הדבק את פרטי הגישה של כל פלטפורמה. "אוטומטי" = כתבה שמתפרסמת באתר נשלחת לרשת לבד
            (בדיקה כל 20 דקות). הטקסט לכל פוסט נכתב על ידי ה-AI בסגנון המתאים לפלטפורמה.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PLATFORMS.map((platform) => {
              const meta = PLATFORM_META[platform];
              const row = accounts[platform];
              const hasCreds = meta.fields.every((f) => (row.credentials[f.key] ?? "").trim());
              return (
                <div key={platform} className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: meta.color }}
                    >
                      <meta.Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.enabled && hasCreds ? "מחובר" : hasCreds ? "מוגדר, כבוי" : "לא מוגדר"}
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-0.5" title="הפעלת הפלטפורמה">
                      <Switch
                        checked={row.enabled}
                        onCheckedChange={(v) => setAccount(platform, { enabled: v })}
                      />
                      <span className="text-[10px] text-muted-foreground">פעיל</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5" title="פרסום אוטומטי של כתבות חדשות">
                      <Switch
                        checked={row.auto_publish}
                        onCheckedChange={(v) => setAccount(platform, { auto_publish: v })}
                      />
                      <span className="text-[10px] text-muted-foreground">אוטומטי</span>
                    </div>
                  </div>
                  {meta.fields.map((f) => (
                    <Input
                      key={f.key}
                      dir="ltr"
                      placeholder={f.hint ? `${f.label} (${f.hint})` : f.label}
                      value={row.credentials[f.key] ?? ""}
                      onChange={(e) =>
                        setAccount(platform, {
                          credentials: { ...row.credentials, [f.key]: e.target.value },
                        })
                      }
                    />
                  ))}
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{meta.help}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={savingPlatform === platform}
                    onClick={() => saveAccount(platform)}
                  >
                    {savingPlatform === platform ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    שמור
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Manual publish */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            פרסום ידני
          </CardTitle>
          <CardDescription>בחר כתבה ופלטפורמות — ה-AI מנסח פוסט לכל רשת בנפרד ומפרסם.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={publishArticleId}
            onChange={(e) => setPublishArticleId(e.target.value)}
            aria-label="כתבה לפרסום"
          >
            <option value="">בחר כתבה...</option>
            {recentPublished.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-4">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className={`flex items-center gap-1.5 text-sm ${
                  accounts[p].enabled ? "" : "opacity-40 pointer-events-none"
                }`}
              >
                <Checkbox
                  checked={publishTargets.includes(p)}
                  onCheckedChange={(v) =>
                    setPublishTargets((t) => (v ? [...t, p] : t.filter((x) => x !== p)))
                  }
                />
                {PLATFORM_META[p].label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground mr-auto">
              <Checkbox checked={forceRepost} onCheckedChange={(v) => setForceRepost(!!v)} />
              פרסם שוב גם אם כבר פורסם
            </label>
          </div>
          <Button onClick={handlePublish} disabled={isPublishing || enabledPlatforms.length === 0} className="gap-2">
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            פרסם עכשיו
          </Button>
          {enabledPlatforms.length === 0 && (
            <p className="text-xs text-muted-foreground">חבר והפעל לפחות פלטפורמה אחת למעלה.</p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            יומן פרסומים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">עדיין לא פורסם כלום.</p>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => {
                const meta = PLATFORM_META[post.platform as Platform];
                return (
                  <div key={post.id} className="flex items-start gap-3 p-2.5 border rounded-lg text-sm">
                    {post.status === "posted" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{articleTitle(post.article_id)}</p>
                      {post.error && <p className="text-xs text-destructive mt-0.5 break-words">{post.error}</p>}
                      {post.post_text && (
                        <details className="mt-0.5">
                          <summary className="text-xs text-muted-foreground cursor-pointer">הטקסט שפורסם</summary>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{post.post_text}</p>
                        </details>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {meta?.label ?? EXTRA_LABELS[post.platform] ?? post.platform}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {new Date(post.created_at).toLocaleString("he-IL")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSocialTab;
