import { useEffect, useMemo, useRef, useState } from "react";
import { Article, getFeaturedArticle, getBreakingNews } from "@/hooks/useArticles";
import { Calendar, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@/lib/router-compat";
import OptimizedImage from "./OptimizedImage";
import { categoryColor } from "@/lib/categoryColor";

interface FeaturedArticleProps {
  articles: Article[];
}

/** How long each story holds the hero before the next one rotates in. */
const ROTATE_MS = 7000;

/**
 * The hero rotates through the pinned article plus every breaking (בזק)
 * story: a random different one every few seconds, so the top of the page is
 * never the same twice. Hovering pauses the rotation — the story someone is
 * about to click must not slip away under the cursor.
 */
const FeaturedArticle = ({ articles }: FeaturedArticleProps) => {
  const pool = useMemo(() => {
    const featured = getFeaturedArticle(articles);
    if (!featured) return [] as Article[];
    const breaking = getBreakingNews(articles).filter((a) => a.id !== featured.id);
    return [featured, ...breaking];
  }, [articles]);

  const [index, setIndex] = useState(0);
  const hovering = useRef(false);

  useEffect(() => {
    if (pool.length < 2) return;
    const timer = setInterval(() => {
      if (hovering.current) return;
      setIndex((current) => {
        // A random pick that is never the story already on screen.
        let next = Math.floor(Math.random() * (pool.length - 1));
        if (next >= current) next += 1;
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [pool.length]);

  const featured = pool[index] ?? pool[0];
  if (!featured) return null;

  return (
    <Link
      to={`/article/${encodeURIComponent(featured.slug || featured.id)}`}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
    >
      <div className="relative rounded-2xl overflow-hidden shadow-hover group cursor-pointer">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.article
            key={featured.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Background Image */}
            <div className="aspect-[4/3] sm:aspect-[21/9] md:aspect-[21/8] relative">
              <OptimizedImage
                src={featured.imageUrl}
                alt={featured.title}
                priority // Featured article is above the fold
                fetchPriority="high"
                width={1280}
                aspectRatio={21 / 8}
                quality={80}
                wrapperClassName="w-full h-full"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/40 to-transparent" />
            </div>

            {/* Content */}
            <div className="absolute bottom-0 right-0 left-0 p-4 sm:p-6 md:p-10">
              <div className="max-w-3xl">
                <span
                  className="inline-block px-3 py-1 text-white text-xs sm:text-sm font-semibold rounded-sm mb-2 sm:mb-4"
                  style={{ backgroundColor: categoryColor(featured.categorySlug || featured.category) }}
                >
                  {featured.category}
                </span>
                <h2 className="text-lg sm:text-2xl md:text-4xl font-black text-primary-foreground mb-2 sm:mb-4 leading-tight line-clamp-3 sm:line-clamp-none">
                  {featured.title}
                </h2>
                <p className="text-primary-foreground/80 text-sm sm:text-base md:text-lg mb-2 sm:mb-4 line-clamp-2 hidden sm:block">
                  {featured.excerpt}
                </p>
                <div className="flex items-center gap-6 text-primary-foreground/60 text-sm">
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {featured.author}
                  </span>
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(featured.date).toLocaleDateString("he-IL")}
                  </span>
                </div>
              </div>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
    </Link>
  );
};

export default FeaturedArticle;
