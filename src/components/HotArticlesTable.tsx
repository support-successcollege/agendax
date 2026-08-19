import { useMemo } from "react";
import { Flame, Eye } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { Article } from "@/data/articles";
import { useHotArticles } from "@/hooks/usePageViews";
import { categoryColor } from "@/lib/categoryColor";
import OptimizedImage from "./OptimizedImage";

interface HotArticlesTableProps {
  articles: Article[];
}

/**
 * The live hot-articles table: ranked by views in the last 48 hours and
 * refreshed every minute, so the order reshuffles through the day. When the
 * window is quiet (fresh site, slow night) the newest articles fill the
 * remaining rows — an empty "hot" section would read as a broken one.
 */
const HotArticlesTable = ({ articles }: HotArticlesTableProps) => {
  const { hot } = useHotArticles(48, 10);

  const rows = useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    const ranked: { article: Article; views: number | null }[] = [];
    for (const h of hot) {
      const article = byId.get(h.articleId);
      if (article) ranked.push({ article, views: h.views });
    }
    if (ranked.length < 10) {
      const seen = new Set(ranked.map((r) => r.article.id));
      for (const article of articles) {
        if (ranked.length >= 10) break;
        if (!seen.has(article.id)) ranked.push({ article, views: null });
      }
    }
    return ranked.slice(0, 10);
  }, [hot, articles]);

  if (rows.length === 0) return null;

  return (
    <section className="mt-8 glass-panel rounded-xl p-6 shadow-card overflow-hidden" aria-label="הכתבות החמות">
      <div className="flex items-center gap-2 mb-5">
        <Flame className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-bold text-lg text-foreground">הכתבות החמות</h3>
        {/* The pulse says "this is live" without a word of copy. */}
        <span className="relative flex h-2 w-2 mr-1" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-xs text-muted-foreground">מתעדכן כל דקה · 48 שעות אחרונות</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <ol className="divide-y divide-border/60">
        {rows.map(({ article, views }, i) => (
          <li key={article.id}>
            <Link
              to={`/article/${encodeURIComponent(article.slug || article.id)}`}
              className="press flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-surface-2/60 transition-colors group"
            >
              <span
                className={`w-7 shrink-0 text-center font-black tabular-nums ${
                  i === 0 ? "text-xl text-primary" : i < 3 ? "text-lg text-foreground/80" : "text-muted-foreground/50"
                }`}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <OptimizedImage
                src={article.imageUrl}
                alt=""
                width={80}
                aspectRatio={1}
                wrapperClassName="w-11 h-11 shrink-0 rounded-md"
                className="w-full h-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                <span
                  className="inline-block mt-0.5 rounded-sm px-1.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
                >
                  {article.category}
                </span>
              </div>
              {views !== null && (
                <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  {views.toLocaleString("he-IL")}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default HotArticlesTable;
