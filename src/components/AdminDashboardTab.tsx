import { useState } from "react";
import { Article } from "@/hooks/useArticles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  useTodayViewCount,
  useTodayNewArticles,
  usePeriodViewCount,
  useTopPages,
  usePathNames,
  useVisitorStats,
  getRangeBounds,
  type ViewRangePreset,
} from "@/hooks/usePageViews";
import AdminArticleCalendar from "@/components/AdminArticleCalendar";
import AdminAIAdvice from "@/components/AdminAIAdvice";
import AdminBackup from "@/components/AdminBackup";
import { submitSitemap } from "@/lib/admin.functions";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  Edit,
  Eye,
  Globe,
  Loader2,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

const SitemapSubmitCard = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; submittedAt: string } | null>(null);
  const { toast } = useToast();

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const data = await submitSitemap();
      setLastResult({ success: data.success, submittedAt: data.submittedAt });
      toast({
        title: data.success ? "הוגש בהצלחה!" : "הגשה חלקית",
        description: data.success ? "מפות האתר הוגשו לגוגל בהצלחה" : "חלק מהמפות לא הוגשו בהצלחה",
        variant: data.success ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "שגיאה", description: "לא ניתן היה להגיש את מפות האתר", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          הגשת Sitemap לגוגל
        </CardTitle>
        <CardDescription>הגש את מפות האתר ל-Google Search Console לשיפור האינדוקס</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {isSubmitting ? "מגיש..." : "הגש עכשיו"}
        </Button>
        {lastResult && (
          <span className="text-sm text-muted-foreground">
            הגשה אחרונה: {new Date(lastResult.submittedAt).toLocaleString("he-IL")} -{" "}
            {lastResult.success ? "✅ הצלחה" : "❌ כשלון"}
          </span>
        )}
      </CardContent>
    </Card>
  );
};

interface AdminDashboardTabProps {
  articles: Article[];
  articleViews: Record<string, number>;
  onEdit: (article: Article) => void;
  onReschedule: (article: Article, newIso: string) => Promise<void> | void;
  onShowAllArticles: () => void;
}

const RANGE_PRESETS: [ViewRangePreset, string][] = [
  ["today", "היום"],
  ["yesterday", "אתמול"],
  ["week", "השבוע"],
  ["month", "החודש"],
  ["lastMonth", "חודש שעבר"],
  ["custom", "בין תאריכים"],
];

const AdminDashboardTab = ({
  articles,
  articleViews,
  onEdit,
  onReschedule,
  onShowAllArticles,
}: AdminDashboardTabProps) => {
  const { todayViews } = useTodayViewCount();
  const { todayNewArticles } = useTodayNewArticles();
  const { periodViews } = usePeriodViewCount();
  const { visitorStats } = useVisitorStats();
  const [viewsRange, setViewsRange] = useState<ViewRangePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const rangeBounds = getRangeBounds(viewsRange, customFrom, customTo);
  const { topPages, isLoading: isTopPagesLoading } = useTopPages(rangeBounds.from, rangeBounds.to);
  const { resolvePathName } = usePathNames();
  const [toolsOpen, setToolsOpen] = useState(false);

  // Four numbers answer "how is the site doing right now". The rest are
  // context, so they sit in one quiet row instead of competing for the eye.
  const primary = [
    { title: "כניסות היום", value: todayViews, icon: Eye },
    { title: "מבקרים ייחודיים היום", value: visitorStats?.today ?? 0, icon: Users },
    { title: "כניסות השבוע", value: periodViews.week, icon: TrendingUp },
    { title: "כניסות החודש", value: periodViews.month, icon: Calendar },
  ];
  const secondary = [
    { title: "מבקרים ייחודיים החודש", value: visitorStats?.month ?? 0 },
    { title: "סה״כ מבקרים ייחודיים", value: visitorStats?.total ?? 0 },
    { title: "סה״כ כניסות", value: periodViews.allTime },
    { title: "סה״כ כתבות", value: articles.length },
    { title: "כתבות חדשות היום", value: todayNewArticles },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {primary.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <stat.icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{stat.title}</span>
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                {stat.value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            {secondary.map((stat) => (
              <div key={stat.title}>
                <dt className="text-xs text-muted-foreground">{stat.title}</dt>
                <dd className="text-lg font-semibold tabular-nums">{stat.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Recent articles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>כתבות אחרונות</CardTitle>
            <Button variant="ghost" size="sm" onClick={onShowAllArticles}>
              לכל הכתבות
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {articles.slice(0, 6).map((article) => (
                <li key={article.id} className="flex items-center gap-3 py-2.5">
                  <img
                    src={article.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={44}
                    height={44}
                    className="h-11 w-11 shrink-0 rounded-lg bg-muted object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{article.title}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{article.date}</span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Eye className="h-3 w-3" />
                        {(articleViews[article.id] || 0).toLocaleString()}
                      </span>
                      {article.isDraft && (
                        <Badge variant="secondary" className="text-xs">
                          טיוטה
                        </Badge>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => onEdit(article)}
                    aria-label={`ערוך: ${article.title}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {articles.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">אין כתבות עדיין</p>
            )}
          </CardContent>
        </Card>

        {/* Top pages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              הדפים הנצפים ביותר
            </CardTitle>
            <CardDescription>
              הספירה כוללת כניסות לכל דפי האתר (כולל דף הבית), רענונים וסורקים אוטומטיים.
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {RANGE_PRESETS.map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  className="shrink-0"
                  variant={viewsRange === key ? "default" : "outline"}
                  aria-pressed={viewsRange === key}
                  onClick={() => setViewsRange(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {viewsRange === "custom" && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-auto"
                  aria-label="מתאריך"
                />
                <span className="text-sm text-muted-foreground">עד</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-auto"
                  aria-label="עד תאריך"
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isTopPagesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין נתונים בטווח שנבחר.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{topPages.length.toLocaleString()} דפים</span>
                  <span className="font-bold">
                    סה״כ {topPages.reduce((s, p) => s + p.count, 0).toLocaleString()} צפיות
                  </span>
                </div>
                <div className="max-h-[340px] space-y-2 overflow-y-auto pl-1">
                  {topPages.map((page) => {
                    const name = resolvePathName(page.path);
                    return (
                      <div
                        key={page.path}
                        className="flex items-center justify-between gap-4 border-b border-border/50 pb-2 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">{name ?? page.path}</p>
                          {!name && (
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">
                              {page.path}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {page.count.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AdminArticleCalendar articles={articles} onReschedule={onReschedule} />

      <AdminAIAdvice />

      {/* Backup and sitemap are run a few times a year. They stay reachable
          without sitting between the numbers and the calendar. */}
      <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between gap-2">
            <span className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              כלים: גיבוי ושחזור, הגשת Sitemap
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 pt-6">
          <AdminBackup />
          <SitemapSubmitCard />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default AdminDashboardTab;
