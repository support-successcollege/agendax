import type { Article } from "@/hooks/useArticles";
import StoryCard from "@/components/news/StoryCard";
import SectionHeader from "@/components/news/SectionHeader";

/**
 * The stock photo the ingest pipeline falls back to when a story has no
 * picture of its own. A card built on it looks like every other fallback
 * card, so those stories are skipped here.
 */
const STOCK_FALLBACK_IMAGE = "photo-1504711434969-e33886168f5c";

const SAME_CATEGORY_COUNT = 3;

const hasOwnImage = (article: Article) =>
  !!article.imageUrl && !article.imageUrl.includes(STOCK_FALLBACK_IMAGE);

/**
 * What to show under a story: the three newest live stories from the same
 * section, then the newest live story from any other section, so the reader
 * gets both "more of this" and "what else is happening". `all` is the list
 * the route loader already primed (newest first), so this is a pure in-memory
 * pass and the links are in the server-rendered HTML.
 */
function pickRelatedArticles(all: Article[], current: Article): Article[] {
  const candidates = all.filter(
    (article) =>
      article.id !== current.id && !article.isDraft && hasOwnImage(article),
  );
  const sameCategory = candidates
    .filter((article) => article.categorySlug === current.categorySlug)
    .slice(0, SAME_CATEGORY_COUNT);
  const elsewhere = candidates.find(
    (article) => article.categorySlug !== current.categorySlug,
  );

  const seen = new Set<string>();
  return [...sameCategory, ...(elsewhere ? [elsewhere] : [])].filter(
    (article) => {
      if (seen.has(article.id)) return false;
      seen.add(article.id);
      return true;
    },
  );
}

interface RelatedArticlesProps {
  current: Article;
  articles: Article[];
}

const RelatedArticles = ({ current, articles }: RelatedArticlesProps) => {
  const related = pickRelatedArticles(articles, current);
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
