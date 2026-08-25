import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Article, getFeaturedArticle, getBreakingNews } from "@/hooks/useArticles";
import StoryCard from "./StoryCard";
import { mastheadDate } from "@/lib/newsTime";

/** How long the top story holds before the next one rotates in. */
const ROTATE_MS = 9000;

/**
 * The front page's opening block: one story at full size, and the next four
 * beside it in a row. The top slot rotates through the week's leading stories
 * (10 picked automatically every Sunday, at least 2 per category — see
 * refresh_hero_rotation in the DB); hovering holds it, because a story
 * someone is reaching for must not move.
 *
 * The four secondary slots never repeat the lead, and they are not part of the
 * rotation — a reader who looks away and back should find the same four.
 */
const LeadBlock = ({ articles }: { articles: Article[] }) => {
  const { data: rotationIds = [] } = useQuery({
    queryKey: ["hero-rotation"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      // hero_rotation is newer than the generated DB types — the untyped
      // escape hatch until the next type regeneration.
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => { order: (col: string) => Promise<{ data: { article_id: string }[] | null }> };
        };
      };
      const { data } = await client.from("hero_rotation").select("article_id, rank").order("rank");
      return (data ?? []).map((r) => r.article_id);
    },
  });

  const pool = useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    const weekly = rotationIds.map((id) => byId.get(id)).filter((a): a is Article => !!a);
    if (weekly.length >= 2) return weekly;
    const featured = getFeaturedArticle(articles);
    if (!featured) return articles.slice(0, 5);
    const breaking = getBreakingNews(articles).filter((a) => a.id !== featured.id);
    return [featured, ...breaking, ...articles].filter(
      (a, i, all) => all.findIndex((x) => x.id === a.id) === i,
    );
  }, [articles, rotationIds]);

  const [index, setIndex] = useState(0);
  const hovering = useRef(false);

  useEffect(() => {
    if (pool.length < 2) return;
    const timer = setInterval(() => {
      if (hovering.current) return;
      setIndex((current) => {
        let next = Math.floor(Math.random() * (pool.length - 1));
        if (next >= current) next += 1;
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [pool.length]);

  const lead = pool[index] ?? pool[0];
  if (!lead) return null;

  const seconds = articles.filter((a) => a.id !== lead.id).slice(0, 4);

  return (
    <section aria-label="הכותרת הראשית">
      <p className="mb-3 text-[12px] font-semibold tracking-wide text-muted-foreground">{mastheadDate()}</p>

      <div
        onMouseEnter={() => (hovering.current = true)}
        onMouseLeave={() => (hovering.current = false)}
        className="pb-5 border-b border-border"
      >
        <StoryCard article={lead} variant="lead" priority />
      </div>

      {seconds.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5 pt-5">
          {seconds.map((article) => (
            <StoryCard key={article.id} article={article} variant="card" />
          ))}
        </div>
      )}
    </section>
  );
};

export default LeadBlock;
