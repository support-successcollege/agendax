import { useMemo } from "react";
import Header from "@/components/Header";
import BreakingNews from "@/components/BreakingNews";
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
      <BreakingNews articles={publishedArticles} />

      <main className="container py-8" id="main-content">
        <header className="mb-8">
          <h1 className="type-headline text-foreground">{title}</h1>
          <div className="mt-3 h-0.5 w-16 bg-gradient-brand rounded-full" aria-hidden="true" />
        </header>

        {bannerWidgets.length > 0 && (
          <div className="mb-8">
            <WidgetBanner widgets={bannerWidgets} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {categoryArticles.length > 0 ? (
              <ArticleGrid articles={categoryArticles} title="" />
            ) : (
              <p className="text-muted-foreground py-12 text-center">
                אין עדיין כתבות בקטגוריה הזו.
              </p>
            )}
          </div>
          <div className="lg:col-span-1">
            <Sidebar articles={publishedArticles} rotatingWidgets={sidebarWidgets} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CategoryPage;
