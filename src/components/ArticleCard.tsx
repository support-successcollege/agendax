import { Article } from "@/data/articles";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "@/lib/router-compat";
import OptimizedImage from "./OptimizedImage";

interface ArticleCardProps {
  article: Article;
  index: number;
  variant?: "default" | "horizontal";
}

const ArticleCard = ({ article, index, variant = "default" }: ArticleCardProps) => {
  if (variant === "horizontal") {
    return (
      <Link to={`/article/${encodeURIComponent(article.slug || article.id)}`}>
        <motion.article
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: index * 0.1 }}
          className="flex gap-4 p-4 bg-card rounded-xl shadow-card hover:shadow-hover transition-all duration-300 cursor-pointer group"
        >
          <OptimizedImage
            src={article.imageUrl}
            alt={article.title}
            width={120}
            aspectRatio={1}
            wrapperClassName="w-28 h-28 shrink-0 rounded-lg"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="flex flex-col justify-between py-1">
            <div>
              <span className="text-xs font-semibold text-accent">{article.category}</span>
              <h3 className="font-bold text-foreground mt-1 line-clamp-2 group-hover:text-primary transition-colors">
                {article.title}
              </h3>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(article.date).toLocaleDateString("he-IL")}
            </span>
          </div>
        </motion.article>
      </Link>
    );
  }

  // Instagram-style 4:5 portrait card
  return (
    <Link to={`/article/${encodeURIComponent(article.slug || article.id)}`}>
      <motion.article
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="relative aspect-[4/5] overflow-hidden rounded-lg cursor-pointer group"
      >
        <OptimizedImage
          src={article.imageUrl}
          alt={article.title}
          width={400}
          aspectRatio={4 / 5}
          wrapperClassName="w-full h-full"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Content overlay */}
        <div className="absolute inset-0 p-4 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="inline-block w-fit px-2 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded mb-2">
            {article.category}
          </span>
          <h3 className="font-bold text-primary-foreground text-sm line-clamp-2">
            {article.title}
          </h3>
          <span className="text-xs text-primary-foreground/70 flex items-center gap-1 mt-2">
            <Calendar className="w-3 h-3" />
            {new Date(article.date).toLocaleDateString("he-IL")}
          </span>
        </div>

        {/* Category badge always visible */}
        <div className="absolute top-3 right-3">
          <span className="px-2 py-1 bg-primary/90 text-primary-foreground text-xs font-semibold rounded backdrop-blur-sm">
            {article.category}
          </span>
        </div>
      </motion.article>
    </Link>
  );
};

export default ArticleCard;
