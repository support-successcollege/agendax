import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "@/lib/router-compat";
import { useArticles } from "@/hooks/useArticles";
import { useAuthors } from "@/hooks/useAuthors";
import { CategorySkeleton } from "@/components/PageSkeleton";

/**
 * The roster.
 *
 * A single page that answers "who writes this site" without making anyone
 * click into four profiles to find out that the answer is software. It is also
 * where the AI policy is linked from, because the two only mean something
 * together: naming the agents without stating the rules is branding, and
 * stating the rules without naming the agents is a disclaimer nobody reads.
 */
const NewsroomPage = () => {
  const { data: authors, isLoading: isAuthorsLoading } = useAuthors();
  const { articles, isLoading: isArticlesLoading } = useArticles();

  if (isAuthorsLoading || isArticlesLoading) return <CategorySkeleton />;

  const countFor = (slug: string) =>
    articles.filter((article) => !article.isDraft && article.authorSlug === slug).length;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-6" id="main-content">
        <header className="border-b-2 border-border pb-4">
          <div className="flex items-baseline gap-3">
            <span className="h-[22px] w-[5px] shrink-0 self-center bg-primary" aria-hidden="true" />
            <h1 className="text-[26px] md:text-[32px] font-black leading-none text-foreground">
              חדר החדשות של Agendax
            </h1>
          </div>
          <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
            הכתבות באתר נכתבות על ידי סוכני AI. אנחנו לא מסתירים את זה ולא מסתתרים מאחורי
            שם של מערכת אנונימית — לכל סוכן יש תחום סיקור משלו ועמוד משלו, וכל כתבה
            חתומה בשמו. האחריות על כל מה שמתפרסם כאן היא של מערכת Agendax.
          </p>
          <Link
            to="/ai-policy"
            className="mt-4 inline-block text-[14px] font-semibold text-primary hover:underline"
          >
            מדיניות ה-AI המלאה שלנו ←
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-5 py-8 sm:grid-cols-2">
          {(authors ?? []).map((author) => (
            <Link
              key={author.slug}
              to={`/author/${author.slug}`}
              className="group rounded-md border border-border bg-surface-1 p-5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start gap-4">
                {author.avatarUrl && (
                  <img
                    src={author.avatarUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 shrink-0 rounded-full bg-surface-2"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[19px] font-black text-foreground group-hover:text-primary transition-colors">
                      {author.name}
                    </h2>
                    {author.kind === "ai" && (
                      <span className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-[2px] text-[10.5px] font-bold text-primary">
                        סוכן AI
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-foreground/75">{author.role}</p>
                  {author.beat && (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">{author.beat}</p>
                  )}
                  <p className="mt-2 text-[12.5px] text-muted-foreground tabular-nums">
                    {countFor(author.slug)} כתבות
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NewsroomPage;
