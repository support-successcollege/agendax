import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Sunrise } from "lucide-react";

type BriefItem = { text: string; article_id: string | null; slug: string | null };

/**
 * "5 דברים שצריך לדעת הבוקר" — written automatically every morning from the
 * last day's articles (the morning-brief function). Shows the freshest brief
 * from the last two days; renders nothing when there is none.
 */
const MorningBrief = () => {
  const { data } = useQuery({
    queryKey: ["daily-brief"],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_briefs")
        .select("brief_date, items")
        .gte("brief_date", since)
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const items = (Array.isArray(data?.items) ? data!.items : []) as unknown as BriefItem[];
  if (items.length === 0) return null;

  const dateLabel = new Date(`${data!.brief_date}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // **מודגש** at the head of each bullet, without pulling in a markdown lib.
  const renderText = (text: string) => {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="text-foreground">{part}</strong> : part));
  };

  return (
    <section aria-label="תקציר הבוקר" className="mb-8 rounded-xl border border-primary/25 bg-primary/5 p-5 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Sunrise className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg text-foreground">5 דברים שצריך לדעת הבוקר</h2>
        <span className="text-xs text-muted-foreground mr-auto">{dateLabel}</span>
      </div>
      <ol className="space-y-2.5">
        {items.map((item, i) => {
          const inner = (
            <>
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm md:text-[15px] leading-relaxed text-foreground/85">{renderText(item.text)}</span>
            </>
          );
          return (
            <li key={i}>
              {item.slug || item.article_id ? (
                <Link
                  to={`/article/${encodeURIComponent(item.slug || item.article_id!)}`}
                  className="flex items-start gap-3 group"
                >
                  <span className="contents group-hover:[&_span:last-child]:text-primary">{inner}</span>
                </Link>
              ) : (
                <span className="flex items-start gap-3">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default MorningBrief;
