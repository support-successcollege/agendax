import { useMemo } from "react";
import Header from "@/components/Header";
import BreakingNews from "@/components/BreakingNews";
import FeaturedArticle from "@/components/FeaturedArticle";
import ArticleGrid from "@/components/ArticleGrid";
import HotArticlesTable from "@/components/HotArticlesTable";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";

import WidgetBanner from "@/components/WidgetBanner";
import WidgetPopup from "@/components/WidgetPopup";
import { useCategories } from "@/hooks/useCategories";
import { useArticles } from "@/hooks/useArticles";
import { useSidebarWidgets } from "@/hooks/useSidebarWidgets";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { articles, isLoading: isArticlesLoading } = useArticles();
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const { widgets } = useSidebarWidgets();
  
  // Filter out drafts for public display
  const publishedArticles = articles.filter(article => !article.isDraft);

  // Split widgets by type
  const { bannerWidgets, popupWidgets, sidebarWidgets } = useMemo(() => {
    const active = widgets.filter(w => w.isActive);
    return {
      bannerWidgets: active.filter(w => w.widgetTypes.includes("banner")),
      popupWidgets: active.filter(w => w.widgetTypes.includes("popup")),
      sidebarWidgets: active.filter(w => w.widgetTypes.includes("card")),
    };
  }, [widgets]);
  
  const filteredArticles = publishedArticles;

  if (isArticlesLoading || isCategoriesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>

      <div className="min-h-screen bg-background">
        <Header />
        <BreakingNews articles={publishedArticles} />

        <main className="container py-8" id="main-content">
          <h1 className="sr-only">Agendax — סדר היום של הטכנולוגיה, ה-AI והעסקים</h1>
          {/* Featured Article - only on home */}
          {filteredArticles.length > 0 && (
            <div className="mb-8">
              <FeaturedArticle articles={filteredArticles} />
            </div>
          )}

          {/* Banner Ad Widget(s) - rotating */}
          {bannerWidgets.length > 0 && (
            <div className="mb-8">
              <WidgetBanner widgets={bannerWidgets} />
            </div>
          )}

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Article Grid */}
          <div className="lg:col-span-2">
            <ArticleGrid
              articles={filteredArticles}
              title="כתבות אחרונות"
            />

            {/* Live hot-articles table */}
            {publishedArticles.length > 0 && <HotArticlesTable articles={publishedArticles} />}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <Sidebar articles={publishedArticles} rotatingWidgets={sidebarWidgets} />
            </div>
          </div>
        </main>

        <Footer />
        

        {/* Popup Ad Widget - first popup only, appears after 10 seconds */}
        {popupWidgets.length > 0 && <WidgetPopup widget={popupWidgets[0]} delayMs={10000} />}
      </div>
    </>
  );
};

export default Index;
