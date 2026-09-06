import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import type { Article } from "@/hooks/useArticles";
import { categoryColor } from "@/lib/categoryColor";
import SectionHeader from "./SectionHeader";

type PickRow = {
  article_id: string;
  rank: number;
  note: string | null;
  pick_date: string;
};

/**
 * "בחירת העורכים" — the rail's front section, one set per day.
 *
 * It replaced a most-read list ranked by 48-hour page views. At this site's
 * traffic that ranking was noise: the same three articles held the top for a
 * week, which is the opposite of a page someone tends. The set behind this
 * component is chosen every morning, never repeats an article inside ten days,
 * and carries a line of reasoning per pick — the line is what makes the
 * section read as edited rather than computed, so it gets real space here
 * rather than a tooltip.
 */
const EditorsPicks = ({ articles }: { articles: Article[] }) => {
  const { data: rows = [] } = useQuery({
    queryKey: ["editors-picks"],
    // The set changes once a day; refetching more often buys nothing.
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<PickRow[]> => {
      const { data } = await supabase
        .from("editors_picks")
        .select("article_id, rank, note, pick_date")
        .order("pick_date", { ascending: false })
        .order("rank", { ascending: true })
        .limit(24);
      const all = (data ?? []) as PickRow[];
      // Whatever the newest day in the table is — not today specifically. If
      // this morning's build failed, yesterday's selection stands; a section
      // one day stale is invisible, an empty one is a bug the reader sees.
      const latest = all[0]?.pick_date;
      return all.filter((row) => row.pick_date === latest);
    },
  });

  const picks = useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    return rows
      .map((row) => ({ article: byId.get(row.article_id), note: row.note }))
      .filter((p): p is { article: Article; note: string | null } => !!p.article);
  }, [rows, articles]);

  if (picks.length === 0) return null;

  const pickDate = rows[0]?.pick_date;
  const day = pickDate
    ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(
        new Date(`${pickDate}T12:00:00`),
      )
    : undefined;

  return (
    <section aria-label="בחירת העורכים">
      <SectionHeader title="בחירת העורכים" note={day} />
      <ul className="divide-y divide-border border-b border-border">
        {picks.map(({ article, note }) => (
          <li key={article.id}>
            <Link
              to={`/article/${encodeURIComponent(article.slug || article.id)}`}
              className="group flex items-start gap-2.5 py-3"
            >
              <span
                className="mt-[5px] h-[24px] w-[3px] shrink-0"
                style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
                title={article.category}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {article.title}
                </span>
                {note && (
                  <span className="mt-1 block text-[12px] leading-snug text-muted-foreground line-clamp-2">
                    {note}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">בחירת מערכת Agendax</p>
    </section>
  );
};

export default EditorsPicks;
