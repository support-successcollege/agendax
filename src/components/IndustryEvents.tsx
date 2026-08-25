import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, ExternalLink } from "lucide-react";
import SectionHeader from "@/components/news/SectionHeader";

type EventRow = {
  id: string;
  title: string;
  event_date: string;
  time_label: string | null;
  location: string | null;
  organizer: string | null;
  url: string | null;
};

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

/**
 * "כנסים ואירועים בתעשייה" — the next conferences, refreshed daily from the
 * IVC / events.co.il / Innovation Authority calendars. Hidden when empty.
 */
const IndustryEvents = () => {
  const { data: events = [] } = useQuery({
    queryKey: ["industry-events"],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<EventRow[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("industry_events")
        .select("id, title, event_date, time_label, location, organizer, url")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(6);
      return (data ?? []) as EventRow[];
    },
  });

  if (events.length === 0) return null;

  return (
    <section aria-label="כנסים ואירועים">
      <SectionHeader title="כנסים ואירועים" />
      <ul className="divide-y divide-border border-b border-border">
        {events.map((ev) => {
          const d = new Date(`${ev.event_date}T12:00:00`);
          return (
            <li key={ev.id}>
              <a
                href={ev.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-3 py-2.5 group"
              >
                <span className="shrink-0 w-11 h-11 border border-border bg-surface-2 flex flex-col items-center justify-center leading-none">
                  <span className="text-[17px] font-black text-primary tabular-nums">{d.getDate()}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">{MONTHS[d.getMonth()]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {ev.title}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {[ev.time_label, ev.location, ev.organizer].filter(Boolean).join(" · ") || "פרטים באתר המארגן"}
                  </span>
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
              </a>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        מתעדכן יומית מלוחות האירועים של IVC, אנשים ומחשבים ורשות החדשנות
      </p>
    </section>
  );
};

export default IndustryEvents;
