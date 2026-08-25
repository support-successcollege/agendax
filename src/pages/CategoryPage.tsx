import { useMemo } from "react";
import Header from "@/components/Header";
import NewsTicker from "@/components/news/NewsTicker";
import StoryCard from "@/components/news/StoryCard";
import ArticleGrid from "@/components/ArticleGrid";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import WidgetBanner from "@/components/WidgetBanner";
import { useParams } from "@/lib/router-compat";
import { useCategories } from "@/hooks/useCategories";
import { useArticles, getArticlesByCategory } from "@/hooks/useArticles";
import { useSidebarWidgets } from "@/hooks/useSidebarWidgets";
import { CategorySkeleton } from "@/components/PageSkeleton";

// A category's own page. The navbar links here — categories are real routes
// with their own URL, head and prerendered HTML, not filters on the homepage.
const CategoryPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const { articles, isLoading: isArticlesLoading } = useArticles();
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const { widgets } = useSidebarWidgets();

  const publishedArticles = articles.filter((article) => !article.isDraft);
  const categoryArticles = getArticlesByCategory(publishedArticles, slug);
  const category = categories.find((c) => c.slug === slug);

  const { bannerWidgets, sidebarWidgets } = useMemo(() => {
    const active = widgets.filter((w) => w.isActive);
    return {
      bannerWidgets: active.filter((w) => w.widgetTypes.includes("banner")),
      sidebarWidgets: active.filter((w) => w.widgetTypes.includes("card")),
    };
  }, [widgets]);

  if (isArticlesLoading || isCategoriesLoading) {
    return <CategorySkeleton />;
  }

  const title = category?.name ?? slug;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NewsTicker articles={publishedArticles} />

      <main className="container py-6" id="main-content">
        <header className="mb-6 flex items-baseline gap-3 border-b-2 border-border pb-2">
          <span className="h-[22px] w-[5px] shrink-0 self-center bg-primary" aria-hidden="true" />
          <h1 className="text-[26px] md:text-[30px] font-black leading-none text-foreground">{title}</h1>
          <span className="text-[12px] text-muted-foreground">{categoryArticles.length} כתבות</span>
        </header>

        {bannerWidgets.length > 0 && (
          <div className="mb-8">
            <WidgetBanner widgets={bannerWidgets} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-x-8 gap-y-8">
          <div className="min-w-0">
            {categoryArticles.length > 0 ? (
              <>
                <div className="pb-5 border-b border-border">
                  <StoryCard article={categoryArticles[0]} variant="lead" priority />
                </div>
                {categoryArticles.length > 1 && (
                  <div className="grid gap-x-6 sm:grid-cols-2 pt-1">
                    {categoryArticles.slice(1).map((article) => (
                      <StoryCard
                        key={article.id}
                        article={article}
                        variant="list"
                        className="border-b border-border"
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground py-12 text-center">
                אין עדיין כתבות בקטגוריה הזו.
              </p>
            )}
          </div>
          <div className="min-w-0 lg:border-r lg:border-border lg:pr-8">
            <Sidebar articles={publishedArticles} rotatingWidgets={sidebarWidgets} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CategoryPage;
