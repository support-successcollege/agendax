import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Mail, Loader2, Trash2, Users } from "lucide-react";

interface Subscriber {
  id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  full_name: string | null;
  phone: string | null;
  interest_category: string | null;
}

const AdminNewsletterTab = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchSubscribers = async () => {
    try {
      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSubscribers(data || []);
    } catch (error) {
      console.error("Error fetching subscribers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const handleExportExcel = () => {
    const activeSubscribers = subscribers.filter(s => s.is_active);
    const headers = ["שם מלא", "אימייל", "טלפון", "תחום עניין", "תאריך הרשמה", "סטטוס"];
    const rows = activeSubscribers.map(s => [
      s.full_name || "",
      s.email,
      s.phone || "",
      s.interest_category || "",
      new Date(s.created_at).toLocaleDateString("he-IL"),
      s.is_active ? "פעיל" : "לא פעיל",
    ]);

    const csvContent = "\uFEFF" + [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `newsletter_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "הקובץ הורד בהצלחה",
      description: `${activeSubscribers.length} נרשמים יוצאו לקובץ CSV`,
    });
  };

  const handleDeleteSubscriber = async (id: string) => {
    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setSubscribers(prev => prev.filter(s => s.id !== id));
      toast({ title: "הנרשם הוסר בהצלחה" });
    } catch (error) {
      console.error("Error deleting subscriber:", error);
      toast({ title: "שגיאה במחיקת נרשם", variant: "destructive" });
    }
  };

  const activeCount = subscribers.filter(s => s.is_active).length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            נרשמי ניוזלטר
          </CardTitle>
          <CardDescription>
            {activeCount} נרשמים פעילים מתוך {subscribers.length} סה״כ
          </CardDescription>
        </div>
        <Button onClick={handleExportExcel} className="gap-2" disabled={subscribers.length === 0}>
          <Download className="w-4 h-4" />
          ייצוא ל-Excel
        </Button>
      </CardHeader>
      <CardContent>
        {subscribers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>אין נרשמים עדיין</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subscribers.map((subscriber) => (
              <div
                key={subscriber.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  {subscriber.full_name && (
                    <span className="font-semibold">{subscriber.full_name}</span>
                  )}
                  <span className="font-medium" dir="ltr">{subscriber.email}</span>
                  {subscriber.phone && (
                    <span className="text-sm text-muted-foreground" dir="ltr">{subscriber.phone}</span>
                  )}
                  {subscriber.interest_category && (
                    <Badge variant="outline" className="text-xs">{subscriber.interest_category}</Badge>
                  )}
                  <Badge variant={subscriber.is_active ? "default" : "secondary"} className="text-xs">
                    {subscriber.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {new Date(subscriber.created_at).toLocaleDateString("he-IL")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-8 w-8"
                    onClick={() => handleDeleteSubscriber(subscriber.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminNewsletterTab;
