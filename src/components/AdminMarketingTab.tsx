// "כתבה שיווקית": paste a business website URL, the system scrapes it, writes
// a Hebrew marketing article about it and files the result as a draft under
// the dedicated category — this tab is the form plus the running history.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Megaphone, ExternalLink, Sparkles } from "lucide-react";
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

type GenerateResult = { ok: boolean; articleId: string; title: string };

export default function AdminMarketingTab() {
  const [url, setUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
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

  const generate = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("יש להזין כתובת אתר");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await invokeEdge<GenerateResult>("marketing-article", { url: trimmed });
      toast.success(`הטיוטה "${result.title}" נשמרה — מחכה לאישור בטאב כתבות`);
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["marketing-articles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "יצירת הכתבה נכשלה");
    } finally {
      setIsGenerating(false);
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
            מזינים כתובת אתר של עסק — המערכת סורקת את האתר, מבינה במה מדובר, כותבת כתבה
            שיווקית ושומרת אותה כטיוטה תחת הקטגוריה "כתבה שיווקית". האישור והפרסום נשארים בידיים שלך.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
          {isGenerating && (
            <p className="text-sm text-muted-foreground mt-3">
              סריקת האתר וכתיבת הכתבה אורכות בדרך כלל חצי דקה עד דקה — אפשר להישאר בעמוד.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>כתבות שיווקיות שנוצרו</CardTitle>
          <CardDescription>טיוטות עוברות עריכה ופרסום מטאב "כתבות" כמו כל כתבה.</CardDescription>
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
              {articles.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-4 border border-border/60 rounded-xl p-3"
                >
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
