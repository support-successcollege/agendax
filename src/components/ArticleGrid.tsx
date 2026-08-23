import { useState } from "react";
import { Article } from "@/data/articles";
import ArticleCard from "./ArticleCard";
import { ChevronDown } from "lucide-react";

interface ArticleGridProps {
  articles: Article[];
  title?: string;
  initialCount?: number;
  loadMoreCount?: number;
}

const ArticleGrid = ({ articles, title, initialCount = 9, loadMoreCount = 9 }: ArticleGridProps) => {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const visibleArticles = articles.slice(0, visibleCount);
  const hasMore = visibleCount < articles.length;

  return (
    <section>
      {title && (
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}
      {articles.length > 0 ? (
        <>
          {/* Each card is a proportional miniature of the 1080×1350 post PNG,
              so the grid reads as a wall of the social posts themselves.
              Phones get two per row — at three the headline drops below
              readable size and people simply don't tap. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-1">
            {visibleArticles.map((article, index) => (
              <ArticleCard key={article.id} article={article} index={index} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setVisibleCount((c) => c + loadMoreCount)}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors text-sm"
              >
                הצג עוד
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>אין כתבות להצגה</p>
        </div>
      )}
    </section>
  );
};

export default ArticleGrid;
