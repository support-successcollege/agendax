import { useSyncExternalStore } from "react";

// News sites stamp every headline, and the stamp shortens as the story ages:
// minutes while it is breaking, a clock time for the rest of today, a date
// once it is older. Anything else makes a homepage read as stale.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Pages are prerendered on a UTC machine and read in Israel, so every stamp
// names Israel's zone instead of taking the zone the code happens to run in.
const TZ = "Asia/Jerusalem";
const clock = (d: Date) => d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayMonth = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: TZ });
/** Israel's calendar day as YYYY-MM-DD. */
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

type TimeValue = string | Date | null | undefined;

/**
 * `relative: false` gives the absolute stamp ("23.11 11:24"): the same string
 * whenever and wherever it is computed. The prerendered HTML and the browser's
 * hydration pass have to use it, because a label measured from "now" differs
 * between the build and the reader, and React then throws the server HTML away.
 */
export function timeLabel(value: TimeValue, relative = true): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  if (!relative) return `${dayMonth(d)} ${clock(d)}`;

  const diff = Date.now() - d.getTime();
  if (diff < 0) return clock(d);
  if (diff < MINUTE) return "עכשיו";
  if (diff < HOUR) return `לפני ${Math.floor(diff / MINUTE)} דק׳`;

  const today = dayKey(new Date());
  if (dayKey(d) === today) return clock(d);

  // Stepping back from noon UTC keeps "yesterday" right on the two days a year
  // that are not 24 hours long.
  const yesterday = dayKey(new Date(Date.parse(`${today}T12:00:00Z`) - 24 * HOUR));
  if (dayKey(d) === yesterday) return `אתמול ${clock(d)}`;

  return dayMonth(d);
}

const subscribeNever = () => () => {};

/** False on the server and while React hydrates the server HTML, true after. */
export const useHydrated = () =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

/** timeLabel for components: the absolute stamp until hydration is done, the relative one after. */
export const useTimeLabel = (value: TimeValue) => timeLabel(value, useHydrated());

/** useTimeLabel as a component, for loops and conditionals where a hook cannot be called. */
export const TimeLabel = ({ value }: { value: TimeValue }) => useTimeLabel(value);

/** The masthead date line: "יום שלישי | 25.8.2026". */
export function mastheadDate(d = new Date()): string {
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long", timeZone: TZ });
  return `${weekday} | ${d.toLocaleDateString("he-IL", { timeZone: TZ })}`;
}
