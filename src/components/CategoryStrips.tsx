import { Link } from "@/lib/router-compat";
import { ChevronLeft } from "lucide-react";
import type { Article } from "@/hooks/useArticles";
import type { Category } from "@/hooks/useCategories";
import ArticleCard from "@/components/ArticleCard";

interface CategoryStripsProps {
  articles: Article[];
  categories: Category[];
}

/**
 * One strip per active category: its four freshest articles and a link to the
 * full category page. Deepens the homepage and feeds internal links to the
 * category SEO surfaces.
 */
const CategoryStrips = ({ articles, categories }: CategoryStripsProps) => {
  const strips = categories
    .filter((c) => c.isActive && c.slug !== "home" && c.slug !== "marketing")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((category) => ({
      category,
      items: articles.filter((a) => a.categorySlug === category.slug).slice(0, 4),
    }))
    .filter((s) => s.items.length > 0);

  if (strips.length === 0) return null;

  return (
    <div className="space-y-10">
      {strips.map(({ category, items }) => (
        <section key={category.id} aria-label={category.name}>
          <div className="flex items-center justify-between mb-4 border-b-2 border-primary/20 pb-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="w-1.5 h-6 rounded-full bg-primary inline-block" />
              {category.name}
            </h2>
            <Link
              to={`/category/${category.slug}`}
              className="text-sm text-primary font-medium flex items-center gap-1 hover:gap-2 transition-all"
            >
              לכל הכתבות
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {items.map((article, index) => (
              <ArticleCard key={article.id} article={article} index={index} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default CategoryStrips;
