import { Link } from "@/lib/router-compat";
import type { Article } from "@/hooks/useArticles";
import OptimizedImage from "@/components/OptimizedImage";
import { categoryColor } from "@/lib/categoryColor";
import { timeLabel } from "@/lib/newsTime";

/**
 * The one story unit the whole site is built from, in the four densities a
 * news page needs. No cards, no shadows, no rounded corners: a photo, a
 * category tag, a headline and a timestamp, separated by hairlines — the
 * layout that lets a reader scan twenty stories in one screen.
 *
 *   lead  — the top story: large photo, biggest headline, standfirst.
 *   card  — a column item: 16:9 photo above a two-line headline.
 *   list  — a row: small square thumb beside the headline.
 *   text  — headline only, for rails and dense lists.
 */
type Variant = "lead" | "card" | "list" | "text";

interface StoryCardProps {
  article: Article;
  variant?: Variant;
  /** Above-the-fold stories load their image eagerly. */
  priority?: boolean;
  className?: string;
}

export function CategoryTag({ article, className = "" }: { article: Article; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 px-1.5 py-[2px] text-[11px] font-bold leading-tight text-white ${className}`}
      style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
    >
      {article.category}
    </span>
  );
}

const StoryCard = ({ article, variant = "card", priority = false, className = "" }: StoryCardProps) => {
  const href = `/article/${encodeURIComponent(article.slug || article.id)}`;
  const when = timeLabel(article.publishedAt || article.date);

  if (variant === "lead") {
    return (
      <article className={className}>
        <Link to={href} className="group grid gap-4 md:grid-cols-[1fr_1.1fr] md:gap-6 items-start">
          <div className="order-2 md:order-1">
            <CategoryTag article={article} className="mb-2" />
            <h2 className="text-2xl md:text-[34px] font-black leading-[1.12] text-foreground group-hover:text-primary transition-colors text-balance">
              {article.title}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground line-clamp-3">{article.excerpt}</p>
            <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground/80">
              <span>{article.author}</span>
              {when && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{when}</span>
                </>
              )}
            </div>
          </div>
          <OptimizedImage
            src={article.imageUrl}
            alt={article.title}
            priority={priority}
            fetchPriority={priority ? "high" : undefined}
            width={760}
            aspectRatio={16 / 9}
            quality={80}
            wrapperClassName="order-1 md:order-2 w-full aspect-video overflow-hidden bg-surface-2"
            className="w-full h-full object-cover"
          />
        </Link>
      </article>
    );
  }

  if (variant === "list") {
    return (
      <article className={className}>
        <Link to={href} className="group flex gap-3 items-start py-3">
          <OptimizedImage
            src={article.imageUrl}
            alt=""
            width={200}
            aspectRatio={1}
            wrapperClassName="w-[84px] h-[84px] shrink-0 overflow-hidden bg-surface-2"
            className="w-full h-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold leading-snug text-foreground line-clamp-3 group-hover:text-primary transition-colors">
              {article.title}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <CategoryTag article={article} />
              {when && <span className="tabular-nums">{when}</span>}
            </div>
          </div>
        </Link>
      </article>
    );
  }

  if (variant === "text") {
    return (
      <article className={className}>
        <Link to={href} className="group block py-2.5">
          <h3 className="text-[14px] font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          {when && <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">{when}</span>}
        </Link>
      </article>
    );
  }

  // card
  return (
    <article className={className}>
      <Link to={href} className="group block">
        <OptimizedImage
          src={article.imageUrl}
          alt=""
          priority={priority}
          width={420}
          aspectRatio={16 / 9}
          wrapperClassName="w-full aspect-video overflow-hidden bg-surface-2"
          className="w-full h-full object-cover"
        />
        <div className="pt-2.5">
          <CategoryTag article={article} className="mb-1.5" />
          <h3 className="text-[16px] font-bold leading-snug text-foreground line-clamp-3 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          {when && <span className="mt-1.5 block text-[11px] tabular-nums text-muted-foreground">{when}</span>}
        </div>
      </Link>
    </article>
  );
};

export default StoryCard;
