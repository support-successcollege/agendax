import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { analyzeSite } from "@/lib/ai.functions";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

const AdminAIAdvice = () => {
  const analyzeSiteFn = analyzeSite;
  const [advice, setAdvice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchAdvice = async () => {
    setIsLoading(true);
    try {
      const data = await analyzeSiteFn({ data: undefined });
      setAdvice(data.advice);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              עצות AI לשיפור האתר
            </CardTitle>
            <CardDescription>
              ניתוח חכם של נתוני האתר עם המלצות מעשיות
            </CardDescription>
          </div>
          <Button
            onClick={fetchAdvice}
            disabled={isLoading}
            className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : advice ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isLoading ? "מנתח נתונים..." : advice ? "נתח מחדש" : "נתח את האתר"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!advice && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>לחץ על הכפתור כדי לקבל ניתוח מבוסס AI של ביצועי האתר</p>
            <p className="text-xs mt-1">הניתוח כולל: מקורות תנועה, כתבות מובילות, קטגוריות והמלצות</p>
          </div>
        )}
        {isLoading && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-purple-500" />
            <p className="text-muted-foreground">מנתח את נתוני האתר ומייצר המלצות...</p>
          </div>
        )}
        {advice && !isLoading && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{advice}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminAIAdvice;
