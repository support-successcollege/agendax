import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import SectionHeader from "@/components/news/SectionHeader";

type DealRow = {
  id: string;
  company: string;
  kind: "funding" | "exit" | "ma" | "ipo";
  amount_label: string | null;
  round: string | null;
  investors: string | null;
  article_id: string | null;
  announced_on: string;
};

const KIND_LABEL: Record<DealRow["kind"], { text: string; className: string }> = {
  funding: { text: "גיוס", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  exit: { text: "אקזיט", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  ma: { text: "מיזוג/רכישה", className: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  ipo: { text: "הנפקה", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

/**
 * "גיוסים ואקזיטים" — deals the pipeline extracted from the last two weeks of
 * articles (the morning-brief function). Hidden when the table is empty.
 */
const FundingDeals = () => {
  const { data: deals = [] } = useQuery({
    queryKey: ["funding-deals"],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<DealRow[]> => {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("funding_deals")
        .select("id, company, kind, amount_label, round, investors, article_id, announced_on")
        .gte("announced_on", since)
        .order("announced_on", { ascending: false })
        .limit(8);
      return (data ?? []) as DealRow[];
    },
  });

  if (deals.length === 0) return null;

  return (
    <section aria-label="גיוסים ואקזיטים">
      <SectionHeader title="גיוסים ואקזיטים" note="שבועיים אחרונים" />
      <ul className="divide-y divide-border border-b border-border">
        {deals.map((deal) => {
          const kind = KIND_LABEL[deal.kind];
          const details = [deal.round && `סבב ${deal.round}`, deal.investors].filter(Boolean).join(" · ");
          const row = (
            <div className="flex items-center gap-3 py-2.5">
              <span className={`shrink-0 text-[11px] font-bold px-1.5 py-[2px] ${kind.className}`}>
                {kind.text}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground truncate">{deal.company}</span>
                {details && <span className="block text-xs text-muted-foreground truncate">{details}</span>}
              </span>
              {deal.amount_label && (
                <span className="shrink-0 text-sm font-bold text-primary whitespace-nowrap">{deal.amount_label}</span>
              )}
            </div>
          );
          return (
            <li key={deal.id}>
              {deal.article_id ? (
                <Link to={`/article/${deal.article_id}`} className="block -mx-2 px-2 hover:bg-white/[0.03] transition-colors">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default FundingDeals;
