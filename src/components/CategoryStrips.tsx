import type { Article } from "@/hooks/useArticles";
import type { Category } from "@/hooks/useCategories";
import StoryCard from "@/components/news/StoryCard";
import SectionHeader from "@/components/news/SectionHeader";
import { categoryColor } from "@/lib/categoryColor";

interface CategoryStripsProps {
  articles: Article[];
  categories: Category[];
}

/**
 * One block per active category, set the way a section front is: the newest
 * story large, the next three as rows beside it. Deepens the homepage and
 * feeds internal links to the category SEO surfaces.
 */
const CategoryStrips = ({ articles, categories }: CategoryStripsProps) => {
  const strips = categories
    .filter((c) => c.isActive && c.slug !== "home" && c.slug !== "marketing")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((category) => ({
      category,
      items: articles.filter((a) => a.categorySlug === category.slug).slice(0, 5),
    }))
    .filter((s) => s.items.length > 0);

  if (strips.length === 0) return null;

  return (
    <div className="grid gap-x-10 gap-y-9 lg:grid-cols-2">
      {strips.map(({ category, items }) => {
        const [lead, ...rest] = items;
        return (
          <section key={category.id} aria-label={category.name}>
            <SectionHeader
              title={category.name}
              href={`/category/${category.slug}`}
              color={categoryColor(category.slug)}
            />
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-[1.15fr_1fr]">
              <StoryCard article={lead} variant="card" />
              {rest.length > 0 && (
                <div className="divide-y divide-border border-t border-border md:border-t-0">
                  {rest.slice(0, 4).map((article) => (
                    <StoryCard key={article.id} article={article} variant="list" />
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default CategoryStrips;
