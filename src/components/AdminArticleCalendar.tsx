import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Clock, Newspaper } from "lucide-react";
import { Article } from "@/hooks/useArticles";

interface AdminArticleCalendarProps {
  articles: Article[];
}

const DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

const AdminArticleCalendar = ({ articles }: AdminArticleCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  // Map articles by date string (YYYY-MM-DD)
  const articlesByDate = useMemo(() => {
    const map: Record<string, { article: Article; type: "published" | "scheduled" }[]> = {};

    articles.forEach((a) => {
      // Scheduled articles
      if (a.scheduledAt && a.isDraft) {
        const dateKey = a.scheduledAt.slice(0, 10);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push({ article: a, type: "scheduled" });
      }
      // Published articles by date
      if (!a.isDraft && a.date) {
        const dateKey = a.date.slice(0, 10);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push({ article: a, type: "published" });
      }
    });

    return map;
  }, [articles]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const monthLabel = currentMonth.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: { day: number | null; dateKey: string }[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ day: null, dateKey: "" });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateKey });
  }

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedArticles = selectedDate ? articlesByDate[selectedDate] || [] : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>יומן כתבות</CardTitle>
            <CardDescription>צפייה בכתבות מתוזמנות ומפורסמות לפי תאריך</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>היום</Button>
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm min-w-[120px] text-center">{monthLabel}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_HE.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (cell.day === null) {
              return <div key={idx} className="h-20" />;
            }
            const items = articlesByDate[cell.dateKey] || [];
            const isToday = cell.dateKey === todayKey;
            const isSelected = cell.dateKey === selectedDate;
            const scheduledCount = items.filter((i) => i.type === "scheduled").length;
            const publishedCount = items.filter((i) => i.type === "published").length;

            const dayOfWeek = new Date(year, month, cell.day).getDay();
            const isSaturday = dayOfWeek === 6;

            let bgColor = "";
            if (!isSaturday) {
              if (items.length >= 2) bgColor = "bg-green-100 dark:bg-green-900/30";
              else if (items.length === 1) bgColor = "bg-yellow-100 dark:bg-yellow-900/30";
              else bgColor = "bg-red-100 dark:bg-red-900/30";
            }

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(isSelected ? null : cell.dateKey)}
                className={`h-20 rounded-lg border text-right p-1.5 transition-colors flex flex-col
                  ${bgColor}
                  ${isToday ? "border-primary ring-1 ring-primary" : "border-border"}
                  ${isSelected ? "ring-2 ring-primary" : ""}
                  ${items.length > 0 ? "hover:opacity-80 cursor-pointer" : "cursor-default"}
                `}
              >
                <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                  {cell.day}
                </span>
                <div className="flex flex-col gap-0.5 mt-auto overflow-hidden">
                  {scheduledCount > 0 && (
                    <div className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3 text-orange-500 shrink-0" />
                      <span className="text-[10px] text-orange-600 truncate">{scheduledCount} מתוזמנות</span>
                    </div>
                  )}
                  {publishedCount > 0 && (
                    <div className="flex items-center gap-0.5">
                      <Newspaper className="w-3 h-3 text-primary shrink-0" />
                      <span className="text-[10px] text-primary truncate">{publishedCount} פורסמו</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected date details */}
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
                  <div key={article.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40">
                    <img src={article.imageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{article.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{article.category}</span>
                        {type === "scheduled" && article.scheduledAt && (
                          <span className="text-orange-600">
                            {new Date(article.scheduledAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={type === "scheduled" ? "outline" : "default"} className={`text-xs ${type === "scheduled" ? "border-orange-300 text-orange-600" : ""}`}>
                      {type === "scheduled" ? "מתוזמנת" : "פורסמה"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminArticleCalendar;
