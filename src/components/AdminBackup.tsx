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

  // Everything the panel can manage is in the backup — content, agent state
  // and audience alike. Restore order follows this list, so referenced tables
  // (categories before articles, sources before ingest items) land first.
  const TABLES = [
    "categories",
    "articles",
    "sidebar_widgets",
    "news_sources",
    "ingest_items",
    "newsletter_subscribers",
    "article_comments",
    "site_settings",
  ] as const;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const results = await Promise.all(TABLES.map((t) => supabase.from(t).select("*")));
      const failed = TABLES.filter((_, i) => results[i].error);
      if (failed.length > 0) {
        throw new Error(`קריאת הטבלאות נכשלה: ${failed.join(", ")}`);
      }

      const data: Record<string, unknown[]> = {};
      TABLES.forEach((t, i) => {
        data[t] = results[i].data || [];
      });

      const backup = { version: "2.0", exportedAt: new Date().toISOString(), data };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agendax-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const counts = TABLES.map((t) => `${t}: ${data[t].length}`).join(" · ");
      toast({ title: "הגיבוי הורד בהצלחה", description: counts });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "שגיאה בגיבוי", description: String(error), variant: "destructive" });
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

      // A restore that partially fails must say so — a success toast over
      // swallowed errors once hid a half-restored database.
      let totalRestored = 0;
      const failures: string[] = [];

      for (const table of Object.keys(backup.data)) {
        const rows = backup.data[table];
        if (!rows || rows.length === 0) continue;
        const onConflict = table === "site_settings" ? "key" : "id";
        const { error } = await supabase
          .from(table as (typeof TABLES)[number])
          .upsert(rows, { onConflict });
        if (error) {
          console.error(`Error restoring ${table}:`, error);
          failures.push(`${table} (${error.message})`);
        } else {
          totalRestored += rows.length;
        }
      }

      if (failures.length > 0) {
        toast({
          title: "השחזור הושלם חלקית",
          description: `שוחזרו ${totalRestored} רשומות. נכשלו: ${failures.join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "שחזור הושלם", description: `שוחזרו ${totalRestored} רשומות` });
      }
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
