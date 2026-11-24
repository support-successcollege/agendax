import { useEffect, useMemo, useRef, useState } from "react";
import { Article } from "@/hooks/useArticles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ArticleQualityBadge from "@/components/ArticleQualityBadge";
import ArticleExportImport from "@/components/ArticleExportImport";
import {
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  Eye,
  ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Search,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";

type StatusFilter = "all" | "published" | "scheduled" | "draft";
type SortKey = "newest" | "oldest" | "views" | "title" | "scheduled";

/** Rows per page. The whole list used to render at once: a thousand rows of
    eight buttons each is what made this tab slow and, on a phone, unusable. */
const PAGE_SIZE = 25;

interface AdminArticlesTabProps {
  articles: Article[];
  articleViews: Record<string, number>;
  rewritingId: string | null;
  onEdit: (article: Article) => void;
  onDelete: (articleId: string) => void;
  onRewrite: (article: Article) => void;
  onBump: (articleId: string) => void;
  onStats: (article: Article) => void;
  onSocialPost: (article: Article) => void;
  onWhatsapp: (article: Article) => void;
  onPostImage: (article: Article) => void;
  onCreateManual: () => void;
  onCreateAI: () => void;
  onImport: (articles: (Omit<Article, "id"> & { id?: string })[]) => Promise<void>;
}

const isScheduled = (article: Article, now: Date) =>
  !!(article.isDraft && article.scheduledAt && new Date(article.scheduledAt) > now);

const AdminArticlesTab = ({
  articles,
  articleViews,
  rewritingId,
  onEdit,
  onDelete,
  onRewrite,
  onBump,
  onStats,
  onSocialPost,
  onWhatsapp,
  onPostImage,
  onCreateManual,
  onCreateAI,
  onImport,
}: AdminArticlesTabProps) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(0);
  const listTop = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const now = new Date();
    let published = 0;
    let scheduled = 0;
    let draft = 0;
    for (const a of articles) {
      if (!a.isDraft) published++;
      else if (isScheduled(a, now)) scheduled++;
      else draft++;
    }
    return { all: articles.length, published, scheduled, draft };
  }, [articles]);

  const filtered = useMemo(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    return articles
      .filter((article) => {
        const scheduled = isScheduled(article, now);
        if (status === "published" && article.isDraft) return false;
        if (status === "scheduled" && !scheduled) return false;
        if (status === "draft" && (!article.isDraft || scheduled)) return false;
        if (!q) return true;
        // Search covers everything an editor remembers about a piece: title,
        // excerpt, category, author, and the body.
        return (
          article.title.toLowerCase().includes(q) ||
          article.excerpt.toLowerCase().includes(q) ||
          article.category.toLowerCase().includes(q) ||
          (article.author ?? "").toLowerCase().includes(q) ||
          (article.content ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "views":
            return (articleViews[b.id] || 0) - (articleViews[a.id] || 0);
          case "title":
            return a.title.localeCompare(b.title, "he");
          case "oldest":
            return +new Date(a.publishedAt || a.date) - +new Date(b.publishedAt || b.date);
          case "scheduled":
            return +new Date(a.scheduledAt || 0) - +new Date(b.scheduledAt || 0);
          default:
            return +new Date(b.publishedAt || b.date) - +new Date(a.publishedAt || a.date);
        }
      });
  }, [articles, articleViews, query, status, sort]);

  // A new search or filter starts from the first page; a list that shrank
  // (a delete on the last page) pulls the page back into range.
  useEffect(() => {
    setPage(0);
  }, [query, status, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const goToPage = (next: number) => {
    setPage(next);
    listTop.current?.scrollIntoView({ block: "start" });
  };

  const filters: { key: StatusFilter; label: string; icon?: typeof Clock }[] = [
    { key: "all", label: `הכל (${counts.all.toLocaleString()})` },
    { key: "published", label: `פורסמו (${counts.published.toLocaleString()})` },
    { key: "scheduled", label: `מתוזמנות (${counts.scheduled.toLocaleString()})`, icon: Clock },
    { key: "draft", label: `טיוטות (${counts.draft.toLocaleString()})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2" onClick={onCreateAI}>
          <Sparkles className="w-4 h-4" />
          כתבה עם AI
        </Button>
        <Button variant="outline" className="gap-2" onClick={onCreateManual}>
          <PenLine className="w-4 h-4" />
          כתבה ידנית
        </Button>
        <div className="flex flex-wrap gap-2 sm:ms-auto">
          <ArticleExportImport articles={articles} onImport={onImport} />
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div ref={listTop} className="scroll-mt-24" />
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי כותרת, תקציר, קטגוריה או תוכן"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-10 text-right"
              aria-label="חיפוש כתבה"
            />
          </div>

          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {filters.map((f) => {
                const Icon = f.icon;
                return (
                  <Button
                    key={f.key}
                    variant={status === f.key ? "default" : "outline"}
                    size="sm"
                    className="shrink-0 gap-1"
                    aria-pressed={status === f.key}
                    onClick={() => setStatus(f.key)}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {f.label}
                  </Button>
                );
              })}
            </div>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="מיון כתבות"
            >
              <option value="newest">חדש ← ישן</option>
              <option value="oldest">ישן ← חדש</option>
              <option value="views">הכי נצפות</option>
              <option value="title">לפי כותרת</option>
              <option value="scheduled">לפי שעת תזמון</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              {query.trim() ? `לא נמצאו כתבות עבור "${query}"` : "אין כתבות בסטטוס הזה."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {visible.map((article) => {
                const scheduled = isScheduled(article, new Date());
                const isRewriting = rewritingId === article.id;
                return (
                  <li
                    key={article.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <img
                        src={article.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={56}
                        height={56}
                        className="h-14 w-14 shrink-0 rounded-lg bg-muted object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-[15px] font-medium leading-snug sm:line-clamp-1">
                          {article.title}
                        </h3>
                        <p className="mt-0.5 hidden truncate text-sm text-muted-foreground md:block">
                          {article.excerpt}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                            {article.category}
                          </span>
                          <span>{article.date}</span>
                          <span className="flex items-center gap-1 tabular-nums">
                            <Eye className="w-3 h-3" />
                            {(articleViews[article.id] || 0).toLocaleString()}
                          </span>
                          {article.isDraft && !scheduled && (
                            <Badge variant="secondary" className="text-xs">
                              טיוטה
                            </Badge>
                          )}
                          {scheduled && article.scheduledAt && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Clock className="w-3 h-3" />
                              {new Date(article.scheduledAt).toLocaleString("he-IL", {
                                day: "numeric",
                                month: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Badge>
                          )}
                          <ArticleQualityBadge
                            content={article.content}
                            title={article.title}
                            excerpt={article.excerpt}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Editing is the everyday action, so it keeps its own
                        button. Everything else lives one tap away. */}
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 sm:flex-none"
                        onClick={() => onEdit(article)}
                      >
                        <Edit className="w-4 h-4" />
                        ערוך
                      </Button>
                      <DropdownMenu dir="rtl">
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-9 px-0"
                            disabled={isRewriting}
                            aria-label={`עוד פעולות: ${article.title}`}
                          >
                            {isRewriting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="w-4 h-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onStats(article)}>
                            <BarChart3 className="w-4 h-4" />
                            סטטיסטיקה
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onSocialPost(article)}>
                            <Share2 className="w-4 h-4" />
                            פוסט לרשתות
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onWhatsapp(article)}>
                            <MessageCircle className="w-4 h-4 text-[#25D366]" />
                            וואטסאפ
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onPostImage(article)}>
                            <ImageIcon className="w-4 h-4" />
                            תמונת פוסט
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onBump(article.id)}>
                            <ArrowUp className="w-4 h-4" />
                            הקפץ לראש האתר
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onRewrite(article)}>
                            <Sparkles className="w-4 h-4" />
                            שכתב עם AI
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 py-2.5 text-destructive focus:text-destructive"
                            onSelect={() => onDelete(article.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            מחק
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {(safePage * PAGE_SIZE + 1).toLocaleString()}-
                {Math.min(filtered.length, (safePage + 1) * PAGE_SIZE).toLocaleString()} מתוך{" "}
                {filtered.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={safePage === 0}
                  onClick={() => goToPage(safePage - 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                  הקודם
                </Button>
                <span className="tabular-nums">
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => goToPage(safePage + 1)}
                >
                  הבא
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminArticlesTab;
