import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Clock, Newspaper, GripVertical } from "lucide-react";
import { Article } from "@/hooks/useArticles";
import { categoryColor } from "@/lib/categoryColor";

interface AdminArticleCalendarProps {
  articles: Article[];
  /** Move a scheduled article to another date (its time of day is kept). */
  onReschedule?: (article: Article, newIso: string) => Promise<void> | void;
}

const DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/**
 * The publishing calendar, interactive: a scheduled article is a chip you can
 * DRAG onto another day to reschedule it (time of day is kept). Cells are
 * tinted by load, the day panel lists everything with times, and the month
 * arrows finally point the way an RTL reader expects.
 */
const AdminArticleCalendar = ({ articles, onReschedule }: AdminArticleCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const articlesByDate = useMemo(() => {
    const map: Record<string, { article: Article; type: "published" | "scheduled" }[]> = {};
    articles.forEach((a) => {
      if (a.scheduledAt && a.isDraft) {
        const dateKey = a.scheduledAt.slice(0, 10);
        (map[dateKey] ??= []).push({ article: a, type: "scheduled" });
      }
      if (!a.isDraft && a.date) {
        const dateKey = a.date.slice(0, 10);
        (map[dateKey] ??= []).push({ article: a, type: "published" });
      }
    });
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => {
        const tx = x.type === "scheduled" ? x.article.scheduledAt ?? "" : "";
        const ty = y.type === "scheduled" ? y.article.scheduledAt ?? "" : "";
        return tx.localeCompare(ty);
      });
    }
    return map;
  }, [articles]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const monthLabel = currentMonth.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: { day: number | null; dateKey: string }[] = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push({ day: null, dateKey: "" });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  const selectedArticles = selectedDate ? articlesByDate[selectedDate] || [] : [];

  const handleDrop = async (dateKey: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    const articleId = e.dataTransfer.getData("text/agendax-article");
    if (!articleId || !onReschedule) return;
    const article = articles.find((a) => a.id === articleId);
    if (!article?.scheduledAt) return;
    if (article.scheduledAt.slice(0, 10) === dateKey) return;
    // Keep the original time of day, move only the date.
    const time = article.scheduledAt.slice(11, 19) || "10:00:00";
    const newIso = new Date(`${dateKey}T${time}`).toISOString();
    await onReschedule(article, newIso);
  };

  const draggableProps = (article: Article) =>
    onReschedule
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData("text/agendax-article", article.id);
            e.dataTransfer.effectAllowed = "move";
          },
        }
      : {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>יומן כתבות</CardTitle>
            <CardDescription>
              גררו כתבה מתוזמנת אל יום אחר כדי לשנות את תאריך הפרסום שלה
            </CardDescription>
          </div>
          {/* RTL: the "back in time" arrow points right, forward points left,
              with the month label between them. */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} aria-label="חודש קודם">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm min-w-[130px] text-center">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={nextMonth} aria-label="חודש הבא">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>היום</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_HE.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (cell.day === null) return <div key={idx} className="h-24" />;
            const items = articlesByDate[cell.dateKey] || [];
            const isToday = cell.dateKey === todayKey;
            const isSelected = cell.dateKey === selectedDate;
            const isDragOver = cell.dateKey === dragOverKey;
            const scheduled = items.filter((i) => i.type === "scheduled");
            const published = items.filter((i) => i.type === "published");
            const isSaturday = new Date(year, month, cell.day).getDay() === 6;

            const load = items.length;
            const bg = isSaturday
              ? "bg-muted/20"
              : load >= 2
                ? "bg-emerald-500/10"
                : load === 1
                  ? "bg-amber-500/10"
                  : "bg-surface-1/40";

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(isSelected ? null : cell.dateKey)}
                onDragOver={(e) => {
                  if (!onReschedule) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverKey(cell.dateKey);
                }}
                onDragLeave={() => setDragOverKey((k) => (k === cell.dateKey ? null : k))}
                onDrop={(e) => handleDrop(cell.dateKey, e)}
                className={`h-24 rounded-lg border text-right p-1.5 transition-all flex flex-col spring
                  ${bg}
                  ${isToday ? "border-primary" : "border-border/60"}
                  ${isSelected ? "ring-2 ring-primary" : ""}
                  ${isDragOver ? "ring-2 ring-primary scale-[1.03] bg-primary/15" : ""}
                  hover:border-primary/40 cursor-pointer
                `}
              >
                <span className={`text-xs font-bold tabular-nums ${isToday ? "text-primary" : "text-foreground/80"}`}>
                  {cell.day}
                </span>
                <div className="flex flex-col gap-0.5 mt-auto overflow-hidden">
                  {scheduled.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                      <Clock className="w-3 h-3 shrink-0" />
                      {scheduled.length} מתוזמנות
                    </span>
                  )}
                  {published.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
                      <Newspaper className="w-3 h-3 shrink-0" />
                      {published.length} פורסמו
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-border/60" /> 2+ כתבות</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/20 border border-border/60" /> כתבה אחת</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-surface-1/60 border border-border/60" /> ריק</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted/40 border border-border/60" /> שבת</span>
        </div>

        {/* Day panel */}
        {selectedDate && (
          <div className="mt-4 border-t pt-4">
            <h4 className="font-medium mb-3 text-sm">
              כתבות ל-{new Date(selectedDate + "T00:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h4>
            {selectedArticles.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין כתבות לתאריך זה</p>
            ) : (
              <div className="space-y-2">
                {selectedArticles.map(({ article, type }) => (
                  <div
                    key={article.id}
                    {...(type === "scheduled" ? draggableProps(article) : {})}
                    className={`flex items-center gap-3 p-2 rounded-lg bg-muted/40 ${
                      type === "scheduled" && onReschedule ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    {type === "scheduled" && onReschedule && (
                      <GripVertical className="w-4 h-4 text-muted-foreground/60 shrink-0" aria-hidden="true" />
                    )}
                    <img src={article.imageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{article.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: categoryColor(article.categorySlug || article.category) }}
                          aria-hidden="true"
                        />
                        <span>{article.category}</span>
                        {type === "scheduled" && article.scheduledAt && (
                          <span className="text-amber-500 tabular-nums">
                            {new Date(article.scheduledAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={type === "scheduled" ? "outline" : "default"}
                      className={`text-xs ${type === "scheduled" ? "border-amber-400/40 text-amber-500" : ""}`}
                    >
                      {type === "scheduled" ? "מתוזמנת" : "פורסמה"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {selectedArticles.some((i) => i.type === "scheduled") && (
              <p className="text-[11px] text-muted-foreground mt-2">
                גררו שורה מתוזמנת אל יום אחר בלוח כדי להזיז אותה.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminArticleCalendar;
