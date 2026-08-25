import { Link } from "@/lib/router-compat";
import type { Article } from "@/hooks/useArticles";
import { getBreakingNews } from "@/hooks/useArticles";
import { timeLabel } from "@/lib/newsTime";

/**
 * The strip every news homepage opens with: the latest headlines side by side,
 * each with the minute it landed, split by hairlines. Static rather than a
 * marquee — a moving headline is a headline nobody finishes reading, and a
 * scrolling strip cannot be scanned at a glance.
 *
 * Breaking stories fill it; when there are none, the freshest articles do, so
 * the strip is never an empty bar at the top of the page.
 */
const NewsTicker = ({ articles }: { articles: Article[] }) => {
  const breaking = getBreakingNews(articles);
  const items = (breaking.length >= 2 ? breaking : articles).slice(0, 4);
  if (items.length === 0) return null;
  const isBreaking = breaking.length >= 2;

  return (
    <div className="border-y border-border bg-card">
      <div className="container flex items-stretch">
        <div className="flex shrink-0 items-center gap-2 py-2.5 pl-4 ml-4 border-l border-border">
          {isBreaking && (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-breaking opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-breaking" />
            </span>
          )}
          <span className={`text-[13px] font-black ${isBreaking ? "text-breaking" : "text-foreground"}`}>
            {isBreaking ? "מבזקים" : "עכשיו באתר"}
          </span>
        </div>

        {/* One row on desktop; a horizontal scroll on phones, where four
            headlines cannot fit and truncating them all would say nothing. */}
        <ul className="flex flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {items.map((article) => (
            <li
              key={article.id}
              className="min-w-[230px] flex-1 border-l border-border last:border-l-0 px-4 py-2.5 first:pr-0"
            >
              <Link
                to={`/article/${encodeURIComponent(article.slug || article.id)}`}
                className="group block"
              >
                <p className="text-[13px] font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">
                  {timeLabel(article.publishedAt || article.date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default NewsTicker;
