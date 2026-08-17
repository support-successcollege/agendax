import { useState, useMemo } from "react";
import { Link } from "@/lib/router-compat";
import Header from "@/components/Header";
import FinancialTicker from "@/components/FinancialTicker";
import BreakingNews from "@/components/BreakingNews";
import FeaturedArticle from "@/components/FeaturedArticle";
import ArticleGrid from "@/components/ArticleGrid";
import OptimizedImage from "@/components/OptimizedImage";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";

import WidgetBanner from "@/components/WidgetBanner";
import WidgetPopup from "@/components/WidgetPopup";
import { useCategories } from "@/hooks/useCategories";
import { useArticles, getArticlesByCategory } from "@/hooks/useArticles";
import { useAllArticleViews } from "@/hooks/usePageViews";
import { useSidebarWidgets } from "@/hooks/useSidebarWidgets";
import { Loader2, TrendingUp } from "lucide-react";

const Index = () => {
  const [activeCategory, setActiveCategory] = useState("home");
  const { articles, isLoading: isArticlesLoading } = useArticles();
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const { articleViews } = useAllArticleViews();
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
  
  const filteredArticles = getArticlesByCategory(publishedArticles, activeCategory);
  const categoryName = categories.find((c) => c.slug === activeCategory)?.name || "ראשי";

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
        <Header activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        <FinancialTicker />
        <BreakingNews articles={publishedArticles} />

        <main className="container py-8" id="main-content">
          <h1 className="sr-only">Agendax — פורטל החדשות המוביל בישראל</h1>
          {/* Featured Article - only on home */}
          {activeCategory === "home" && filteredArticles.length > 0 && (
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
              articles={activeCategory === "home" ? filteredArticles : filteredArticles}
              title={activeCategory === "home" ? "כתבות אחרונות" : categoryName}
            />

            {/* Most Read - Podium Style */}
            {publishedArticles.length > 0 && (() => {
              const topArticles = [...publishedArticles]
                .sort((a, b) => (articleViews[b.id] || 0) - (articleViews[a.id] || 0))
                .slice(0, 3);
              // Podium order: 2nd, 1st, 3rd
              const podiumOrder = topArticles.length >= 3 
                ? [topArticles[1], topArticles[0], topArticles[2]] 
                : topArticles;
              const podiumMeta = [
                { rank: 2, height: "h-28", color: "from-muted/80 to-muted", medal: "🥈", label: "מקום שני" },
                { rank: 1, height: "h-36", color: "from-primary/20 to-primary/5", medal: "🥇", label: "מקום ראשון", glow: true },
                { rank: 3, height: "h-24", color: "from-muted/60 to-muted/30", medal: "🥉", label: "מקום שלישי" },
              ];

              return (
                <div className="mt-8 bg-card rounded-xl p-6 shadow-card overflow-hidden">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="w-5 h-5 text-accent" />
                    <h3 className="font-bold text-lg text-foreground">הנקראים ביותר</h3>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="flex items-end justify-center gap-3 md:gap-4">
                    {podiumOrder.map((article, i) => {
                      const meta = podiumMeta[i];
                      if (!article) return null;
                      const views = articleViews[article.id] || 0;

                      return (
                        <Link
                          key={article.id}
                          to={`/article/${encodeURIComponent(article.slug || article.id)}`}
                          className="flex-1 max-w-[220px] group"
                        >
                          <div className="flex flex-col items-center text-center">
                            {/* Article image */}
                            <div className={`relative w-full aspect-square rounded-xl overflow-hidden mb-3 shadow-md transition-transform duration-300 group-hover:scale-105 ${meta.glow ? "ring-2 ring-primary/40 shadow-lg shadow-primary/10" : ""}`}>
                              <OptimizedImage
                                src={article.imageUrl}
                                alt={article.title}
                                wrapperClassName="w-full h-full"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                              <div className="absolute bottom-2 right-2 left-2">
                                <p className="text-primary-foreground text-xs font-bold line-clamp-2 drop-shadow-md">
                                  {article.title}
                                </p>
                              </div>
                            </div>

                            {/* Medal & rank */}
                            <span className={`text-3xl md:text-4xl mb-1 ${meta.glow ? "drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" : ""}`}>
                              {meta.medal}
                            </span>
                            <span className="text-xs text-muted-foreground font-medium">{meta.label}</span>


                            {/* Podium bar */}
                            <div className={`w-full ${meta.height} bg-gradient-to-t ${meta.color} rounded-t-lg mt-2 flex items-end justify-center pb-2 ${meta.glow ? "border-t-2 border-primary/30" : ""}`}>
                              <span className="text-2xl font-black text-muted-foreground/40">
                                {meta.rank}
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
