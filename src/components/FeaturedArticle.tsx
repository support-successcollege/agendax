import { Article, getFeaturedArticle } from "@/hooks/useArticles";
import { Calendar, User } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "@/lib/router-compat";
import OptimizedImage from "./OptimizedImage";

interface FeaturedArticleProps {
  articles: Article[];
}

const FeaturedArticle = ({ articles }: FeaturedArticleProps) => {
  const featured = getFeaturedArticle(articles);

  if (!featured) return null;

  return (
    <Link to={`/article/${encodeURIComponent(featured.slug || featured.id)}`}>
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative rounded-2xl overflow-hidden shadow-hover group cursor-pointer"
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
            <span className="inline-block px-3 py-1 bg-accent text-accent-foreground text-xs sm:text-sm font-semibold rounded-full mb-2 sm:mb-4">
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
    </Link>
  );
};

export default FeaturedArticle;
