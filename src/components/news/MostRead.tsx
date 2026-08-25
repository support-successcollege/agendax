import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import type { Article } from "@/hooks/useArticles";
import { useHotArticles } from "@/hooks/usePageViews";
import { categoryColor } from "@/lib/categoryColor";
import SectionHeader from "./SectionHeader";

/**
 * The rail's most-read list: ranked by views over the last 48 hours and
 * refreshed every minute, so the order genuinely moves through the day.
 * Numbers instead of thumbnails — the rank is the information here, and ten
 * pictures in a narrow column would crowd out everything below it. On a quiet
 * night the newest articles fill the remaining rows; an empty "most read"
 * reads as a broken one.
 */
const MostRead = ({ articles }: { articles: Article[] }) => {
  const { hot } = useHotArticles(48, 10);

  const rows = useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    const ranked: Article[] = [];
    for (const h of hot) {
      const article = byId.get(h.articleId);
      if (article) ranked.push(article);
    }
    if (ranked.length < 10) {
      const seen = new Set(ranked.map((a) => a.id));
      for (const article of articles) {
        if (ranked.length >= 10) break;
        if (!seen.has(article.id)) ranked.push(article);
      }
    }
    return ranked.slice(0, 10);
  }, [hot, articles]);

  if (rows.length === 0) return null;

  return (
    <section aria-label="הנקראות ביותר">
      <SectionHeader title="הנקראות ביותר" note="48 שעות" />
      <ol className="divide-y divide-border">
        {rows.map((article, i) => (
          <li key={article.id}>
            <Link
              to={`/article/${encodeURIComponent(article.slug || article.id)}`}
              className="group flex items-start gap-2.5 py-2.5"
            >
              <span
                className={`w-5 shrink-0 text-center text-[17px] font-black leading-tight tabular-nums ${
                  i < 3 ? "text-primary" : "text-muted-foreground/45"
                }`}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {article.title}
                </span>
                <span
                  className="mt-1 inline-block h-[3px] w-6"
                  style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
                  title={article.category}
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default MostRead;
