import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, MapPin, ExternalLink } from "lucide-react";

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
    <section aria-label="כנסים ואירועים" className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg text-foreground">כנסים ואירועים בתעשייה</h2>
      </div>
      <ul className="space-y-3">
        {events.map((ev) => {
          const d = new Date(`${ev.event_date}T12:00:00`);
          return (
            <li key={ev.id}>
              <a
                href={ev.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-3 group"
              >
                <span className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex flex-col items-center justify-center leading-none">
                  <span className="text-lg font-extrabold text-primary">{d.getDate()}</span>
                  <span className="text-[10px] text-primary/80 mt-0.5">{MONTHS[d.getMonth()]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
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
