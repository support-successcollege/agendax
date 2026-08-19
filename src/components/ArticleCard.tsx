import { Article } from "@/data/articles";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "@/lib/router-compat";
import OptimizedImage from "./OptimizedImage";
import { categoryColor } from "@/lib/categoryColor";

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
          transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.06 }}
          className="press glass-panel flex gap-4 p-4 rounded-xl shadow-card hover:shadow-hover hover:border-primary/30 spring transition-[box-shadow,border-color] cursor-pointer group"
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
              <span
                className="type-label inline-block rounded px-1.5 py-0.5 text-white"
                style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
              >
                {article.category}
              </span>
              <h3 className="font-bold text-foreground mt-1.5 line-clamp-2 group-hover:text-primary transition-colors">
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

  // 4:5 portrait card. The headline is always legible — a news card that hides
  // its own headline until hover is unreadable while scanning, and invisible on
  // touch, where there is no hover at all.
  return (
    <Link to={`/article/${encodeURIComponent(article.slug || article.id)}`}>
      <motion.article
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.04 }}
        className="press relative aspect-4/5 overflow-hidden rounded-xl cursor-pointer group border border-white/7 hover:border-primary/40 shadow-card hover:shadow-hover spring transition-[box-shadow,border-color]"
      >
        <OptimizedImage
          src={article.imageUrl}
          alt={article.title}
          width={400}
          aspectRatio={4 / 5}
          wrapperClassName="w-full h-full"
          className="w-full h-full object-cover spring transition-transform group-hover:scale-105"
        />

        {/* Scrim, anchored to the deepest surface so the card reads as cut from
            the same material as the page rather than pasted onto it. */}
        <div
          className="absolute inset-0 bg-linear-to-t from-surface-deep via-surface-deep/70 to-transparent"
          aria-hidden="true"
        />

        {/* Same composition as the Canva post template (it's the same 4:5
            frame): centered category label on a full-width color box in the
            category's own color, centered bold white headline beneath it. */}
        <div className="absolute inset-0 p-4 flex flex-col items-center justify-end gap-2 text-center">
          <span
            className="type-label inline-block rounded-sm px-3 py-1 text-white"
            style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
          >
            {article.category}
          </span>
          <h3 className="type-title text-base text-white line-clamp-3">
            {article.title}
          </h3>
          <span className="type-label-mono normal-case tracking-normal text-white/70 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" aria-hidden="true" />
            {new Date(article.date).toLocaleDateString("he-IL")}
          </span>
        </div>
      </motion.article>
    </Link>
  );
};

export default ArticleCard;
