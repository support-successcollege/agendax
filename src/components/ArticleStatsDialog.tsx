import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useArticleStats, useAllArticleViews } from "@/hooks/usePageViews";
import { Article } from "@/hooks/useArticles";
import { BarChart3, Eye, Globe, Calendar, Loader2 } from "lucide-react";

interface ArticleStatsDialogProps {
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ArticleStatsDialog = ({ article, open, onOpenChange }: ArticleStatsDialogProps) => {
  const { referrerStats, dailyViews, isLoading } = useArticleStats(article?.id);
  const { articleViews } = useAllArticleViews();

  const totalViews = article ? (articleViews[article.id] || 0) : 0;

  const formatReferrer = (ref: string) => {
    if (!ref || ref === 'ישיר / לא ידוע') return 'ישיר / לא ידוע';
    try {
      const url = new URL(ref);
      return url.hostname.replace('www.', '');
    } catch {
      return ref;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            סטטיסטיקות כתבה
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Article title */}
            <p className="text-sm text-muted-foreground font-medium line-clamp-2">
              {article?.title}
            </p>

            {/* Total views */}
            <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg">
              <Eye className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalViews.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">סה״כ צפיות</p>
              </div>
            </div>

            {/* Referrer stats */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                מקורות תנועה
              </h3>
              {referrerStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין נתונים עדיין</p>
              ) : (
                <div className="space-y-2">
                  {referrerStats.map((stat: any, i: number) => {
                    const percentage = totalViews > 0 ? Math.round((Number(stat.view_count) / totalViews) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span>{formatReferrer(stat.referrer)}</span>
                            <span className="text-muted-foreground">
                              {Number(stat.view_count).toLocaleString()} ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Daily views */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                צפיות יומיות (30 ימים אחרונים)
              </h3>
              {dailyViews.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין נתונים עדיין</p>
              ) : (
                <div className="space-y-1">
                  {dailyViews.slice(0, 10).map((day: any, i: number) => {
                    const maxViews = Math.max(...dailyViews.map((d: any) => Number(d.view_count)));
                    const barWidth = maxViews > 0 ? (Number(day.view_count) / maxViews) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="w-20 text-muted-foreground text-xs">
                          {new Date(day.view_date).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}
                        </span>
                        <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-accent rounded transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="w-8 text-xs text-left">{Number(day.view_count)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArticleStatsDialog;
