import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { analyzeSite } from "@/lib/ai.functions";
import { Sparkles, Loader2, RefreshCw, History, ChevronDown, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

type AdviceRow = { id: string; content: string; created_at: string };

/**
 * Site-analysis advice, with memory: every run is stored, the freshest shows
 * by default, and the history unfolds below it — so advice accumulates into a
 * record of what the AI said and when, instead of evaporating on reload.
 */
const AdminAIAdvice = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: history = [] } = useQuery({
    queryKey: ["aiAdvice"],
    queryFn: async (): Promise<AdviceRow[]> => {
      const { data, error } = await supabase
        .from("ai_advice")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        console.error("Error loading advice history:", error);
        return [];
      }
      return (data ?? []) as AdviceRow[];
    },
  });

  const latest = history[0];
  const older = history.slice(1);

  const fetchAdvice = async () => {
    setIsLoading(true);
    try {
      const data = await analyzeSite({ data: undefined });
      const { error } = await supabase.from("ai_advice").insert({ content: data.advice });
      if (error) console.error("Error saving advice:", error);
      queryClient.invalidateQueries({ queryKey: ["aiAdvice"] });
    } catch (error) {
      console.error("Error fetching AI advice:", error);
      toast({
        title: "שגיאה בניתוח",
        description: "לא ניתן לייצר ניתוח כרגע, נסה שוב מאוחר יותר",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAdvice = async (id: string) => {
    if (!window.confirm("למחוק את הניתוח הזה מההיסטוריה?")) return;
    const { error } = await supabase.from("ai_advice").delete().eq("id", id);
    if (error) {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["aiAdvice"] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              עצות AI לשיפור האתר
            </CardTitle>
            <CardDescription>ניתוח חכם של נתוני האתר עם המלצות מעשיות — נשמר להיסטוריה</CardDescription>
          </div>
          <Button onClick={fetchAdvice} disabled={isLoading} className="press gap-2 bg-gradient-brand text-primary-foreground hover:opacity-90">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : latest ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isLoading ? "מנתח נתונים..." : latest ? "נתח מחדש" : "נתח את האתר"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!latest && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>לחץ על הכפתור כדי לקבל ניתוח מבוסס AI של ביצועי האתר</p>
            <p className="text-xs mt-1">הניתוח כולל: מקורות תנועה, כתבות מובילות, קטגוריות והמלצות</p>
          </div>
        )}
        {isLoading && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-muted-foreground">מנתח את נתוני האתר ומייצר המלצות...</p>
          </div>
        )}
        {latest && !isLoading && (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              נותח ב-{new Date(latest.created_at).toLocaleString("he-IL")}
            </p>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{latest.content}</ReactMarkdown>
            </div>
            {older.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <History className="w-4 h-4" />
                  היסטוריית ניתוחים ({older.length})
                  <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
                </button>
                {showHistory && (
                  <div className="mt-4 space-y-4">
                    {older.map((row) => (
                      <details key={row.id} className="border rounded-lg p-3">
                        <summary className="cursor-pointer text-sm flex items-center justify-between gap-2">
                          <span>{new Date(row.created_at).toLocaleString("he-IL")}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              deleteAdvice(row.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </summary>
                        <div className="prose prose-sm dark:prose-invert max-w-none mt-3">
                          <ReactMarkdown>{row.content}</ReactMarkdown>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminAIAdvice;
