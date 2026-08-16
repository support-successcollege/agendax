import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Loader2, Database } from "lucide-react";
import { Input } from "@/components/ui/input";

const AdminBackup = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [
        { data: articles },
        { data: categories },
        { data: widgets },
        { data: jobs },
        { data: subscribers },
        { data: comments },
      ] = await Promise.all([
        supabase.from("articles").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("sidebar_widgets").select("*"),
        supabase.from("jobs").select("*"),
        supabase.from("newsletter_subscribers").select("*"),
        supabase.from("article_comments").select("*"),
      ]);

      const backup = {
        version: "1.1",
        exportedAt: new Date().toISOString(),
        data: {
          articles: articles || [],
          categories: categories || [],
          sidebar_widgets: widgets || [],
          jobs: jobs || [],
          newsletter_subscribers: subscribers || [],
          article_comments: comments || [],
        },
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yz-news-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "הגיבוי הורד בהצלחה", description: `${(articles?.length || 0)} כתבות, ${(categories?.length || 0)} קטגוריות, ${(widgets?.length || 0)} חלוניות, ${(jobs?.length || 0)} משרות` });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "שגיאה בגיבוי", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error("קובץ גיבוי לא תקין");
      }

      const tables = ["articles", "categories", "sidebar_widgets", "jobs", "newsletter_subscribers", "article_comments"] as const;
      let totalRestored = 0;

      for (const table of tables) {
        const rows = backup.data[table];
        if (rows && rows.length > 0) {
          const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
          if (error) {
            console.error(`Error restoring ${table}:`, error);
          } else {
            totalRestored += rows.length;
          }
        }
      }

      toast({ title: "שחזור הושלם", description: `שוחזרו ${totalRestored} רשומות` });
    } catch (error) {
      console.error("Import error:", error);
      toast({ title: "שגיאה בשחזור", description: String(error), variant: "destructive" });
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          גיבוי ושחזור
        </CardTitle>
        <CardDescription>ייצוא כל תוכן האתר לקובץ JSON או שחזור מגיבוי קיים</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-4 flex-wrap">
        <Button onClick={handleExport} disabled={isExporting} className="gap-2">
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          הורד גיבוי מלא
        </Button>
        <div className="relative">
          <Button variant="outline" disabled={isImporting} className="gap-2" asChild>
            <label>
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              שחזר מגיבוי
              <Input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminBackup;
