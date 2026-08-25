import { useMemo } from "react";
import Header from "@/components/Header";
import NewsTicker from "@/components/news/NewsTicker";
import LeadBlock from "@/components/news/LeadBlock";
import StoryCard from "@/components/news/StoryCard";
import SectionHeader from "@/components/news/SectionHeader";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import WidgetBanner from "@/components/WidgetBanner";
import WidgetPopup from "@/components/WidgetPopup";
import MorningBrief from "@/components/MorningBrief";
import CategoryStrips from "@/components/CategoryStrips";
import IndustryEvents from "@/components/IndustryEvents";
import FundingDeals from "@/components/FundingDeals";
import { useCategories } from "@/hooks/useCategories";
import { useArticles } from "@/hooks/useArticles";
import { useSidebarWidgets } from "@/hooks/useSidebarWidgets";
import { HomeSkeleton } from "@/components/PageSkeleton";

/**
 * The front page, set like a newspaper's: the lead and its four companions
 * across the top, then a main column of stories beside a rail of lists. Every
 * block is separated by a rule rather than a card, so the eye moves down the
 * page instead of hopping between floating panels.
 */
const Index = () => {
  const { articles, isLoading: isArticlesLoading } = useArticles();
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const { widgets } = useSidebarWidgets();

  const publishedArticles = articles.filter((article) => !article.isDraft);

  const { bannerWidgets, popupWidgets, sidebarWidgets } = useMemo(() => {
    const active = widgets.filter((w) => w.isActive);
    return {
      bannerWidgets: active.filter((w) => w.widgetTypes.includes("banner")),
      popupWidgets: active.filter((w) => w.widgetTypes.includes("popup")),
      sidebarWidgets: active.filter((w) => w.widgetTypes.includes("card")),
    };
  }, [widgets]);

  // The lead block already carries the five newest; the river below picks up
  // where it left off rather than repeating them.
  const river = publishedArticles.slice(5, 17);

  if (isArticlesLoading || isCategoriesLoading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NewsTicker articles={publishedArticles} />

      <main className="container py-6" id="main-content">
        <h1 className="sr-only">Agendax — סדר היום של הטכנולוגיה, ה-AI והעסקים</h1>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-x-8 gap-y-8">
          {/* ---------------- main column ---------------- */}
          <div className="min-w-0 space-y-8">
            {publishedArticles.length > 0 && <LeadBlock articles={publishedArticles} />}

            <MorningBrief />

            {bannerWidgets.length > 0 && <WidgetBanner widgets={bannerWidgets} />}

            {river.length > 0 && (
              <section aria-label="כתבות אחרונות">
                <SectionHeader title="כתבות אחרונות" />
                {/* Two columns of rows: a newspaper's river of stories, twice
                    the density of a card grid at the same height. */}
                <div className="grid gap-x-6 sm:grid-cols-2">
                  {river.map((article) => (
                    <StoryCard
                      key={article.id}
                      article={article}
                      variant="list"
                      className="border-b border-border"
                    />
                  ))}
                </div>
              </section>
            )}

          </div>

          {/* ---------------- rail ---------------- */}
          <div className="min-w-0 space-y-8 lg:border-r lg:border-border lg:pr-8">
            <Sidebar articles={publishedArticles} rotatingWidgets={sidebarWidgets} />
            <FundingDeals />
            <IndustryEvents />
          </div>
        </div>

        {/* The section fronts run the full width: the rail has ended by here,
            and two category blocks side by side use the space a narrow column
            would have wasted. */}
        <div className="mt-10 border-t border-border pt-8">
          <CategoryStrips articles={publishedArticles} categories={categories} />
        </div>
      </main>

      <Footer />

      {popupWidgets.length > 0 && <WidgetPopup widget={popupWidgets[0]} delayMs={10000} />}
    </div>
  );
};

export default Index;
