import { useMemo } from "react";
import Header from "@/components/Header";
import BreakingNews from "@/components/BreakingNews";
import FeaturedArticle from "@/components/FeaturedArticle";
import ArticleGrid from "@/components/ArticleGrid";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import MorningBrief from "@/components/MorningBrief";
import CategoryStrips from "@/components/CategoryStrips";
import IndustryEvents from "@/components/IndustryEvents";
import FundingDeals from "@/components/FundingDeals";

import WidgetBanner from "@/components/WidgetBanner";
import WidgetPopup from "@/components/WidgetPopup";
import { useCategories } from "@/hooks/useCategories";
import { useArticles } from "@/hooks/useArticles";
import { useSidebarWidgets } from "@/hooks/useSidebarWidgets";
import { HomeSkeleton } from "@/components/PageSkeleton";

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
    return <HomeSkeleton />;
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

          {/* The daily five-bullet brief */}
          <MorningBrief />

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

            {/* Deals + industry conferences */}
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FundingDeals />
              <IndustryEvents />
            </div>

            {/* A strip of the freshest stories per category */}
            <div className="mt-10">
              <CategoryStrips articles={publishedArticles} categories={categories} />
            </div>
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
