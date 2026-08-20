import { AlertCircle } from "lucide-react";
import { Article, getBreakingNews } from "@/hooks/useArticles";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "@/lib/router-compat";

interface BreakingNewsProps {
  articles: Article[];
}

const BreakingNews = ({ articles }: BreakingNewsProps) => {
  const breakingNews = getBreakingNews(articles);
  const prefersReduced = useReducedMotion();

  if (breakingNews.length === 0) return null;

  // Speed stays constant regardless of how many headlines are queued: the
  // duration scales with the text length instead of being a fixed 20s.
  const totalChars = breakingNews.reduce((n, a) => n + a.title.length + 3, 0);
  const duration = Math.max(20, Math.round(totalChars / 6));

  const items = (ariaHidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={ariaHidden || undefined}>
      {breakingNews.map((news) => (
        <Link
          key={news.id}
          to={`/article/${encodeURIComponent(news.slug || news.id)}`}
          className="mx-8 hover:underline"
          tabIndex={ariaHidden ? -1 : undefined}
        >
          {news.title}
          <span className="mr-8 select-none" aria-hidden="true">•</span>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="bg-gradient-breaking text-accent-foreground">
      <div className="container py-3">
        <div className="flex items-center gap-4">
          <motion.div
            className="flex items-center gap-2 shrink-0"
            animate={prefersReduced ? undefined : { scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold text-sm">מבזקים</span>
          </motion.div>

          {/* A real marquee: the track holds the headlines twice, and one loop
              travels exactly one copy's width — seamless, always full, and it
              crosses the whole row instead of materializing mid-line. Moving
              rightward means a headline's first (rightmost) word enters first,
              matching the Hebrew reading direction. */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {prefersReduced ? (
              // Reduced motion: the newest headlines, standing still.
              <div className="whitespace-nowrap overflow-hidden text-ellipsis">{items(false)}</div>
            ) : (
              <motion.div
                className="flex w-max whitespace-nowrap"
                animate={{ x: ["-50%", "0%"] }}
                transition={{ duration, repeat: Infinity, ease: "linear" }}
              >
                {items(false)}
                {items(true)}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BreakingNews;
