import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StoryCard from "@/components/news/StoryCard";
import { Link, useParams } from "@/lib/router-compat";
import { useArticles } from "@/hooks/useArticles";
import { useAuthor } from "@/hooks/useAuthors";
import { CategorySkeleton } from "@/components/PageSkeleton";

/**
 * The page behind a byline.
 *
 * Its job is disclosure, not personality: a reader arriving from an article
 * should learn that a machine wrote it, which beat that machine covers, and who
 * answers for what it publishes. How it works is deliberately not here.
 * Everything visual on the page is subordinate to that — including the avatar,
 * which is a mark rather than a face.
 */
const AuthorPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const { data: author, isLoading: isAuthorLoading } = useAuthor(slug);
  const { articles, isLoading: isArticlesLoading } = useArticles();

  if (isAuthorLoading || isArticlesLoading) return <CategorySkeleton />;

  if (!author) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-16 text-center" id="main-content">
          <h1 className="text-2xl font-black text-foreground">הכתב לא נמצא</h1>
          <Link to="/newsroom" className="mt-4 inline-block text-primary hover:underline">
            לחדר החדשות
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const byAuthor = articles
    .filter((article) => !article.isDraft && article.authorSlug === author.slug)
    .slice(0, 60);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-6" id="main-content">
        <nav className="mb-4 text-[12.5px] text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">ראשי</Link>
          <span className="mx-2">›</span>
          <Link to="/newsroom" className="hover:text-primary transition-colors">חדר החדשות</Link>
        </nav>

        <header className="border-b-2 border-border pb-6">
          <div className="flex flex-wrap items-start gap-5">
            {author.avatarUrl && (
              <img
                src={author.avatarUrl}
                alt=""
                width={88}
                height={88}
                className="h-[88px] w-[88px] shrink-0 rounded-full bg-surface-1"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[28px] md:text-[34px] font-black leading-none text-foreground">
                  {author.name}
                </h1>
                {/* Stated at the top, not in the footnotes. */}
                {author.kind === "ai" && (
                  <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-[3px] text-[11px] font-bold tracking-wide text-primary">
                    סוכן AI
                  </span>
                )}
              </div>
              <p className="mt-2 text-[14px] font-semibold text-foreground/80">{author.role}</p>
              {author.beat && (
                <p className="mt-1 text-[13px] text-muted-foreground">{author.beat}</p>
              )}
              <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                {byAuthor.length} כתבות
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-x-8 gap-y-8 pt-6">
          <div className="min-w-0">
            <h2 className="mb-3 flex items-baseline gap-3 border-b-2 border-border pb-2 text-[20px] font-black text-foreground">
              <span className="h-[20px] w-[5px] shrink-0 self-center bg-primary" aria-hidden="true" />
              הכתבות האחרונות
            </h2>
            {byAuthor.length > 0 ? (
              <div className="grid gap-x-6 sm:grid-cols-2">
                {byAuthor.map((article) => (
                  <StoryCard
                    key={article.id}
                    article={article}
                    variant="list"
                    className="border-b border-border"
                  />
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-muted-foreground">אין עדיין כתבות.</p>
            )}
          </div>

          <aside className="min-w-0 lg:border-r lg:border-border lg:pr-8">
            <section className="rounded-md border border-border bg-surface-1 p-5">
              <h2 className="text-[15px] font-black text-foreground">מי כותב כאן</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{author.bio}</p>
            </section>

            {author.modelNote && (
              <section className="mt-4 rounded-md border border-border bg-surface-1 p-5">
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  {author.modelNote}
                </p>
                <Link
                  to="/ai-policy"
                  className="mt-3 inline-block text-[13px] font-semibold text-primary hover:underline"
                >
                  מדיניות ה-AI שלנו
                </Link>
              </section>
            )}

            <section className="mt-4 rounded-md border border-border bg-surface-1 p-5">
              <h2 className="text-[15px] font-black text-foreground">מצאתם טעות?</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                אנחנו מתקנים מהר ומסמנים כל תיקון בגוף הכתבה.
              </p>
              <a
                href="mailto:info@agendax.co.il?subject=תיקון%20לכתבה"
                className="mt-3 inline-block text-[13px] font-semibold text-primary hover:underline"
              >
                לדיווח על טעות
              </a>
            </section>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AuthorPage;
