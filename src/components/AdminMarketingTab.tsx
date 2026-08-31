// "כתבה שיווקית": paste a business website URL and the system scrapes it,
// writes a Hebrew marketing article, and assembles the rest of the placement
// around it — the on-site ad that points at the article and the social copy
// that promotes it. This tab is the form plus the campaign board.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Megaphone,
  ExternalLink,
  Sparkles,
  LayoutGrid,
  Share2,
  Send,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge";

type MarketingArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string | null;
  image_url: string | null;
  is_draft: boolean;
  source_url: string | null;
  created_at: string;
};

type GenerateResult = {
  ok: boolean;
  articleId: string;
  title: string;
  widgetId: string | null;
  socialPrepared: number;
  socialText: string;
};

/** The queue slot a manually promoted placement takes: the next round hour. */
function nextHour(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

export default function AdminMarketingTab() {
  const [url, setUrl] = useState("");
  const [createWidget, setCreateWidget] = useState(true);
  const [prepareSocial, setPrepareSocial] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["marketing-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, excerpt, slug, image_url, is_draft, source_url, created_at")
        .eq("category_slug", "marketing")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MarketingArticle[];
    },
  });

  // What each article already has around it, so the board shows state rather
  // than offering an action that was taken yesterday.
  const ids = articles.map((a) => a.id);
  const { data: assets } = useQuery({
    queryKey: ["marketing-assets", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const links = ids.map((id) => `%/article/${id}`);
      const [widgetRes, socialRes, queueRes] = await Promise.all([
        supabase.from("sidebar_widgets").select("id, link_url, is_active").or(
          links.map((l) => `link_url.like.${l}`).join(","),
        ),
        supabase.from("social_posts").select("article_id, platform, status, post_text").in("article_id", ids),
        supabase.from("social_queue").select("article_id, status").in("article_id", ids),
      ]);
      return {
        widgets: widgetRes.data ?? [],
        social: socialRes.data ?? [],
        queue: queueRes.data ?? [],
      };
    },
  });

  const assetsOf = (articleId: string) => {
    const widget = (assets?.widgets ?? []).find((w) => (w.link_url ?? "").endsWith(`/article/${articleId}`));
    const social = (assets?.social ?? []).filter((s) => s.article_id === articleId);
    const queued = (assets?.queue ?? []).filter(
      (q) => q.article_id === articleId && q.status !== "cancelled",
    );
    return {
      widget,
      prepared: social.filter((s) => s.status === "pending"),
      posted: social.filter((s) => s.status === "posted"),
      queued,
    };
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["marketing-articles"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-assets"] });
    queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
  };

  const generate = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("יש להזין כתובת אתר");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await invokeEdge<GenerateResult>("marketing-article", {
        url: trimmed,
        createWidget,
        prepareSocial,
      });
      const extras = [
        result.widgetId ? "מודעה לאתר" : null,
        result.socialPrepared > 0 ? `פוסט ל-${result.socialPrepared} רשתות` : null,
      ].filter(Boolean);
      toast.success(
        `"${result.title}" נשמרה כטיוטה`,
        { description: extras.length ? `נוצרו גם: ${extras.join(" · ")}` : undefined },
      );
      setUrl("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "יצירת הכתבה נכשלה");
    } finally {
      setIsGenerating(false);
    }
  };

  const queueSocial = async (article: MarketingArticle) => {
    setBusyId(article.id);
    try {
      const { data: accounts } = await supabase
        .from("social_accounts")
        .select("platform")
        .eq("enabled", true);
      const platforms = (accounts ?? []).map((a) => a.platform);
      if (platforms.length === 0) {
        toast.error("אין רשתות מחוברות ופעילות");
        return;
      }
      const at = nextHour();
      const { error } = await supabase.from("social_queue").insert({
        article_id: article.id,
        platforms,
        kind: "post",
        scheduled_at: at.toISOString(),
        source: "manual",
      });
      if (error) throw error;
      toast.success("נוסף לתור הרשתות", {
        description: `${at.toLocaleString("he-IL")} · ${platforms.length} רשתות · אפשר להזיז בטאב רשתות חברתיות`,
      });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ההוספה לתור נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  const copyText = async (articleId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(articleId);
      setTimeout(() => setCopiedId((c) => (c === articleId ? null : c)), 2000);
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            כתבה שיווקית
          </CardTitle>
          <CardDescription>
            מזינים כתובת אתר של עסק — המערכת סורקת אותו, כותבת כתבה שיווקית כטיוטה, ומכינה סביבה
            את שאר הקמפיין: מודעה מוטמעת באתר שמפנה לכתבה, וטקסט פוסט מוכן לרשתות. האישור והפרסום
            נשארים בידיים שלך.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              dir="ltr"
              placeholder="https://example.co.il"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isGenerating) generate();
              }}
              disabled={isGenerating}
              className="flex-1"
            />
            <Button onClick={generate} disabled={isGenerating} className="press gap-2">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? "סורק וכותב..." : "צור כתבה שיווקית"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={createWidget}
                onCheckedChange={(v) => setCreateWidget(!!v)}
                disabled={isGenerating}
              />
              <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
              צור גם מודעה מוטמעת באתר
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={prepareSocial}
                onCheckedChange={(v) => setPrepareSocial(!!v)}
                disabled={isGenerating}
              />
              <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
              הכן גם פוסט לרשתות
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            המודעה נוצרת כבויה — היא עולה לאתר רק כשתדליקו אותה בטאב "חלוניות".
            {isGenerating && " סריקת האתר וכתיבת החומרים אורכות בדרך כלל חצי דקה עד דקה."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>קמפיינים שנוצרו</CardTitle>
          <CardDescription>
            לכל כתבה: מצב הטיוטה, המודעה באתר, והפוסט לרשתות. הפצה לרשתות אפשרית רק אחרי שהכתבה פורסמה.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">עוד לא נוצרו כתבות שיווקיות.</p>
          ) : (
            <div className="space-y-3">
              {articles.map((a) => {
                const { widget, prepared, posted, queued } = assetsOf(a.id);
                const socialText = prepared[0]?.post_text ?? "";
                const canQueue = !a.is_draft && queued.length === 0 && posted.length === 0;
                return (
                  <div key={a.id} className="border border-border/60 rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-4">
                      {a.image_url && (
                        <img
                          src={a.image_url}
                          alt=""
                          className="w-16 h-16 rounded-lg object-cover shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{a.title}</p>
                        {a.source_url && (
                          <a
                            href={a.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary truncate inline-flex items-center gap-1"
                            dir="ltr"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            {a.source_url}
                          </a>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(a.created_at).toLocaleString("he-IL")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.is_draft ? (
                          <Badge variant="secondary">טיוטה</Badge>
                        ) : (
                          <>
                            <Badge>פורסמה</Badge>
                            {a.slug && (
                              <a
                                href={`/article/${encodeURIComponent(a.slug)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                              >
                                צפייה
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Campaign state */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                        {widget ? (
                          <Badge variant={widget.is_active ? "default" : "outline"}>
                            {widget.is_active ? "מודעה פעילה באתר" : "מודעה מוכנה (כבויה)"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">אין מודעה</span>
                        )}
                      </span>

                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                        {posted.length > 0 ? (
                          <Badge>פורסם ב-{posted.length} רשתות</Badge>
                        ) : queued.length > 0 ? (
                          <Badge variant="outline">בתור הרשתות</Badge>
                        ) : prepared.length > 0 ? (
                          <Badge variant="secondary">פוסט מוכן ל-{prepared.length} רשתות</Badge>
                        ) : (
                          <span className="text-muted-foreground">אין פוסט מוכן</span>
                        )}
                      </span>

                      <span className="mr-auto flex items-center gap-2">
                        {socialText && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={() => copyText(a.id, socialText)}
                          >
                            {copiedId === a.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            העתק טקסט
                          </Button>
                        )}
                        {prepared.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
                            disabled={!canQueue || busyId === a.id}
                            title={
                              a.is_draft
                                ? "אפשר להפיץ רק אחרי שהכתבה פורסמה"
                                : canQueue
                                  ? undefined
                                  : "כבר בתור או כבר פורסם"
                            }
                            onClick={() => queueSocial(a)}
                          >
                            {busyId === a.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            הוסף לתור הרשתות
                          </Button>
                        )}
                      </span>
                    </div>

                    {socialText && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          הצג את הפוסט המוכן
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground bg-muted/40 rounded-lg p-3">
                          {socialText}
                        </p>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
