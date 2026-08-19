import { useParams, Link } from "@/lib/router-compat";
import { useMemo } from "react";
import { useArticles, useArticle } from "@/hooks/useArticles";
import { useSidebarWidgets } from "@/hooks/useSidebarWidgets";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WidgetPopup from "@/components/WidgetPopup";
import WidgetBanner from "@/components/WidgetBanner";
import RichHtmlContent from "@/components/RichHtmlContent";
import { Calendar, User, ArrowRight, Tag } from "lucide-react";
import { motion } from "framer-motion";
import ArticleCard from "@/components/ArticleCard";
import OptimizedImage from "@/components/OptimizedImage";
import ArticleReactions from "@/components/ArticleReactions";
import ArticleComments from "@/components/ArticleComments";
import ArticleShare from "@/components/ArticleShare";
import ArticleReader from "@/components/ArticleReader";
import ArticleNewsletterCard from "@/components/ArticleNewsletterCard";
import ReadingProgress from "@/components/ReadingProgress";
import { ArticleSkeleton } from "@/components/PageSkeleton";

const Article = () => {
  const { id } = useParams<{ id: string }>();
  const { article, isLoading } = useArticle(id);
  const { articles: allArticles } = useArticles();
  const { widgets } = useSidebarWidgets();

  const articlePopup = useMemo(() => {
    if (!article) return null;
    const allPopups = widgets.filter(w => w.isActive && w.widgetTypes.includes("popup"));
    // Prefer a popup that targets this article's category; fall back to any active popup
    const categoryMatch = allPopups.find(w =>
      w.categories.length === 0 || w.categories.includes(article.category)
    );
    return categoryMatch || allPopups[0] || null;
  }, [widgets, article]);

  const articleBanners = useMemo(() => {
    if (!article) return [];
    return widgets.filter(w =>
      w.isActive &&
      w.widgetTypes.includes("banner") &&
      (w.categories.length === 0 || w.categories.includes(article.category))
    );
  }, [widgets, article]);


  if (isLoading) {
    return <ArticleSkeleton />;
  }

  // Don't show draft articles on public page
  if (!article || article.isDraft) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground mb-4">הכתבה לא נמצאה</h1>
            <Link to="/" className="text-primary hover:underline">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Get related articles from the same category (exclude drafts)
  const relatedArticles = allArticles
    .filter((a) => a.categorySlug === article.categorySlug && a.id !== article.id && !a.isDraft)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-background flex flex-col">



      <Header />
      <ReadingProgress />

      <main className="flex-1" id="main-content">
        {/* Hero Image */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative h-[40vh] md:h-[50vh]"
        >
          <OptimizedImage
            src={article.imageUrl}
            alt={article.title}
            priority
            wrapperClassName="w-full h-full"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </motion.div>

        {/* Article Content */}
        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-4xl mx-auto bg-card rounded-2xl shadow-hover p-6 md:p-10"
          >
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <Link to="/" className="hover:text-primary transition-colors">
                ראשי
              </Link>
              <ArrowRight className="w-4 h-4 rotate-180" />
              <span className="text-primary">{article.category}</span>
            </nav>

            {/* Category Badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-semibold rounded-full flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {article.category}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-4xl font-black text-foreground mb-6 leading-tight">
              {article.title}
            </h1>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center justify-between gap-4 text-muted-foreground text-sm mb-8 pb-8 border-b border-border">
              <div className="flex flex-wrap items-center gap-6">
                <span className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {article.author}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {new Date(article.date).toLocaleDateString("he-IL", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <ArticleReader title={article.title} excerpt={article.excerpt} content={article.content} />
            </div>

            {/* Reading column: 65-75 characters per line is where reading is
                comfortable; the card is wider than that, so the text gets its
                own measure inside it. */}
            <div className="mx-auto max-w-[70ch]">
            {/* Excerpt */}
            <p className="text-lg md:text-xl text-foreground/80 font-medium mb-8 leading-relaxed">
              {article.excerpt}
            </p>

            {/* Content */}
            {article.content.includes('<') ? (
              // HTML content from rich text editor
              <RichHtmlContent content={article.content} widgets={widgets} />
            ) : (
              // Legacy plain text/markdown content
              <div className="prose prose-lg max-w-none text-foreground/90 leading-relaxed space-y-6">
                {article.content.split('\n\n').map((paragraph, index) => {
                  // Check if it's a heading (bold with **)
                  if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                    return (
                      <h2 key={index} className="text-xl md:text-2xl font-bold text-foreground mt-8 mb-4">
                        {paragraph.replace(/\*\*/g, '')}
                      </h2>
                    );
                  }
                  
                  // Check if it's a heading with content after **
                  if (paragraph.startsWith('**')) {
                    const match = paragraph.match(/^\*\*(.+?)\*\*(.*)$/s);
                    if (match) {
                      return (
                        <div key={index}>
                          <h3 className="text-lg md:text-xl font-bold text-foreground mt-6 mb-3">
                            {match[1]}
                          </h3>
                          {match[2] && (
                            <p className="text-foreground/85 leading-relaxed whitespace-pre-line">
                              {match[2].trim()}
                            </p>
                          )}
                        </div>
                      );
                    }
                  }
                  
                  // Check for blockquote
                  if (paragraph.startsWith('>')) {
                    return (
                      <blockquote key={index} className="border-r-4 border-primary pr-4 my-6 italic text-foreground/75 bg-muted/30 py-4 rounded-l-lg">
                        {paragraph.replace(/^>\s*/, '').replace(/"/g, '')}
                      </blockquote>
                    );
                  }
                  
                  // Check for list items
                  if (paragraph.includes('\n-') || paragraph.startsWith('-')) {
                    const lines = paragraph.split('\n');
                    return (
                      <ul key={index} className="list-disc list-inside space-y-2 mr-4">
                        {lines.map((line, lineIndex) => {
                          const cleanLine = line.replace(/^-\s*/, '').trim();
                          if (!cleanLine) return null;
                          return (
                            <li key={lineIndex} className="text-foreground/85">
                              {cleanLine}
                            </li>
                          );
                        })}
                      </ul>
                    );
                  }
                  
                  // Check for numbered list
                  if (/^\d+\./.test(paragraph)) {
                    const lines = paragraph.split('\n');
                    return (
                      <ol key={index} className="list-decimal list-inside space-y-2 mr-4">
                        {lines.map((line, lineIndex) => {
                          const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
                          if (!cleanLine) return null;
                          return (
                            <li key={lineIndex} className="text-foreground/85">
                              {cleanLine}
                            </li>
                          );
                        })}
                      </ol>
                    );
                  }
                  
                  // Regular paragraph - handle inline bold
                  const formattedText = paragraph.split(/(\*\*[^*]+\*\*)/).map((part, partIndex) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return (
                        <strong key={partIndex} className="font-bold text-foreground">
                          {part.replace(/\*\*/g, '')}
                        </strong>
                      );
                    }
                    return part;
                  });
                  
                  return (
                    <p key={index} className="text-foreground/85 leading-relaxed">
                      {formattedText}
                    </p>
                  );
                })}
              </div>
            )}

            {/* Article Banners */}
            {articleBanners.length > 0 && (
              <div className="mt-8">
                <WidgetBanner widgets={articleBanners} />
              </div>
            )}

            {/* Share */}
            <ArticleShare title={article.title} />

            {/* Reactions */}
            <ArticleReactions articleId={article.id} />

            {/* Comments */}
            <div className="mt-8">
              <ArticleComments articleId={article.id} />
            </div>

            {/* Newsletter Signup */}
            <ArticleNewsletterCard category={article.category} />
            </div>
          </motion.article>

          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="max-w-6xl mx-auto mt-12"
            >
              <h2 className="text-2xl font-bold text-foreground mb-6">כתבות נוספות בקטגוריה</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedArticles.map((relatedArticle, index) => (
                  <ArticleCard key={relatedArticle.id} article={relatedArticle} index={index} />
                ))}
              </div>
            </motion.section>
          )}

          {/* Back to Home */}
          <div className="max-w-6xl mx-auto mt-8 mb-16 flex justify-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              חזרה לדף הבית לכתבות נוספות
            </Link>
          </div>
        </div>
      </main>

      {/* Popup Widget - appears after 30 seconds in articles */}
      {articlePopup && <WidgetPopup widget={articlePopup} delayMs={15000} />}

      <Footer />
    </div>
  );
};

export default Article;
