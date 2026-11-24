import { useQuery } from "@tanstack/react-query";
import type { Article } from "@/hooks/useArticles";
import StoryCard from "@/components/news/StoryCard";
import SectionHeader from "@/components/news/SectionHeader";
import { relatedArticlesQueryOptions } from "@/lib/articleQueries";

interface RelatedArticlesProps {
  current: Article;
}

/**
 * The stories under an article. The route loader primes this query, so the
 * cards and their links are in the prerendered HTML; the page no longer
 * carries the whole article list just to pick four from it.
 */
const RelatedArticles = ({ current }: RelatedArticlesProps) => {
  const { data: related = [] } = useQuery(relatedArticlesQueryOptions(current));
  if (related.length === 0) return null;

  return (
    <section className="max-w-4xl mx-auto mt-12">
      <SectionHeader
        title="כתבות קשורות"
        href={
          current.categorySlug
            ? `/category/${encodeURIComponent(current.categorySlug)}`
            : undefined
        }
        linkLabel={`עוד ב${current.category}`}
      />
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4">
        {related.map((article) => (
          <StoryCard key={article.id} article={article} variant="card" />
        ))}
      </div>
    </section>
  );
};

export default RelatedArticles;
