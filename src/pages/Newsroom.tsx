import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuthors } from "@/hooks/useAuthors";
import { CategorySkeleton } from "@/components/PageSkeleton";
import WriterAvatar from "@/components/article/WriterAvatar";

const db: any = supabase;

/** Published stories per writer, from the same view the admin and sitemap use. */
const usePublishedCounts = () =>
  useQuery({
    queryKey: ["author-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await db
        .from("author_article_counts")
        .select("slug, published_count");
      if (error) throw error;
      return Object.fromEntries(
        ((data as any[]) ?? []).map((row) => [
          row.slug,
          Number(row.published_count),
        ]),
      );
    },
    staleTime: 300_000,
  });

/** The roster: who writes AgendaX, each with a link to their stories. */
const NewsroomPage = () => {
  const { data: authors, isLoading } = useAuthors();
  const { data: counts } = usePublishedCounts();

  if (isLoading) return <CategorySkeleton />;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-6" id="main-content">
        <header className="border-b-2 border-border pb-4">
          <div className="flex items-baseline gap-3">
            <span
              className="h-[22px] w-[5px] shrink-0 self-center bg-primary"
              aria-hidden="true"
            />
            <h1 className="text-[26px] md:text-[32px] font-black leading-none text-foreground">
              חדר החדשות של AgendaX
            </h1>
          </div>
          <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
            הצוות שמסקר עבורכם הייטק, בינה מלאכותית, שוק ההון ופיתוח עסקי. האחריות
            על כל מה שמתפרסם כאן היא של מערכת AgendaX.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 py-8 sm:grid-cols-2">
          {(authors ?? []).map((author) => (
            <Link
              key={author.slug}
              to={`/author/${author.slug}`}
              className="group rounded-md border border-border bg-surface-1 p-5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start gap-4">
                <WriterAvatar
                  name={author.name}
                  avatarUrl={author.avatarUrl}
                  photoAlt={author.photoAlt || author.name}
                  size={64}
                />
                <div className="min-w-0">
                  <h2 className="text-[19px] font-black text-foreground group-hover:text-primary transition-colors">
                    {author.name}
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-foreground/75">
                    {author.role}
                  </p>
                  {author.beat && (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      {author.beat}
                    </p>
                  )}
                  {counts?.[author.slug] !== undefined && (
                    <p className="mt-2 text-[12.5px] text-muted-foreground tabular-nums">
                      {counts[author.slug]} כתבות
                    </p>
                  )}
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
