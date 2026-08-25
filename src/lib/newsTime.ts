// News sites stamp every headline, and the stamp shortens as the story ages:
// minutes while it is breaking, a clock time for the rest of today, a date
// once it is older. Anything else makes a homepage read as stale.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function timeLabel(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const diff = Date.now() - d.getTime();
  if (diff < 0) return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  if (diff < MINUTE) return "עכשיו";
  if (diff < HOUR) return `לפני ${Math.floor(diff / MINUTE)} דק׳`;

  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  if (sameDay) return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return `אתמול ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;

  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

/** The masthead date line: "יום שלישי | 25.8.2026". */
export function mastheadDate(d = new Date()): string {
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  return `${weekday} | ${d.toLocaleDateString("he-IL")}`;
}
