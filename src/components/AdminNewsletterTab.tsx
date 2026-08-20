import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge";
import { useCategories } from "@/hooks/useCategories";
import { useArticles } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Download, Mail, Loader2, Trash2, Users, Send, FlaskConical, History } from "lucide-react";

interface Subscriber {
  id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  full_name: string | null;
  phone: string | null;
  interest_category: string | null;
}

interface SendRecord {
  id: string;
  subject: string;
  category: string | null;
  article_ids: string[];
  recipients_count: number;
  test: boolean;
  created_at: string;
}

type SendResult = { ok: boolean; sent: number; total: number; articles: number; failures: string[] };

const AdminNewsletterTab = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [sends, setSends] = useState<SendRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { categories } = useCategories();
  const { articles } = useArticles();

  // Composer state
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");
  const [category, setCategory] = useState("");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [testEmail, setTestEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const liveCategories = categories.filter((c) => c.slug !== "home" && c.isActive);
  const recentPublished = articles.filter((a) => !a.isDraft).slice(0, 15);

  const fetchAll = useCallback(async () => {
    try {
      const [subsRes, sendsRes] = await Promise.all([
        supabase.from("newsletter_subscribers").select("*").order("created_at", { ascending: false }),
        supabase.from("newsletter_sends").select("*").order("created_at", { ascending: false }).limit(20),
      ]);
      if (subsRes.error) throw subsRes.error;
      setSubscribers((subsRes.data || []) as Subscriber[]);
      setSends(((sendsRes.data || []) as unknown) as SendRecord[]);
    } catch (error) {
      console.error("Error fetching newsletter data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const doSend = async (asTest: boolean) => {
    const finalSubject = subject.trim();
    if (!finalSubject) {
      toast({ title: "חסר נושא למייל", variant: "destructive" });
      return;
    }
    if (asTest && !testEmail.includes("@")) {
      toast({ title: "הזן מייל לבדיקה", variant: "destructive" });
      return;
    }
    const activeCount = subscribers.filter(
      (s) => s.is_active && (!category || [category, "כללי"].includes(s.interest_category ?? "כללי")),
    ).length;
    if (!asTest && !window.confirm(`לשלוח את הניוזלטר ל-${activeCount} נרשמים? אין דרך חזרה.`)) {
      return;
    }
    setIsSending(true);
    try {
      const result = await invokeEdge<SendResult>("send-newsletter", {
        subject: finalSubject,
        intro: intro.trim() || undefined,
        category: category || undefined,
        articleIds: pickedIds.length > 0 ? pickedIds : undefined,
        testEmail: asTest ? testEmail.trim() : undefined,
      });
      if (result.failures?.length) {
        toast({
          title: "השליחה הושלמה חלקית",
          description: `נשלחו ${result.sent}/${result.total}. ${result.failures[0]}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: asTest ? "מייל בדיקה נשלח" : "הניוזלטר נשלח!",
          description: asTest
            ? `בדוק את ${testEmail}`
            : `${result.sent} נמענים · ${result.articles} כתבות`,
        });
      }
      fetchAll();
    } catch (error) {
      toast({
        title: "השליחה נכשלה",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const toggleActive = async (sub: Subscriber) => {
    const { error } = await supabase
      .from("newsletter_subscribers")
      .update({ is_active: !sub.is_active })
      .eq("id", sub.id);
    if (error) {
      toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    fetchAll();
  };

  const deleteSubscriber = async (sub: Subscriber) => {
    if (!window.confirm(`למחוק את ${sub.email} מרשימת התפוצה לצמיתות?`)) return;
    const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", sub.id);
    if (error) {
      toast({ title: "המחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    fetchAll();
  };

  // A real .xlsx via SheetJS — the old hand-rolled CSV broke on any comma.
  const handleExportExcel = () => {
    const rows = subscribers.map((s) => ({
      "שם מלא": s.full_name || "",
      "אימייל": s.email,
      "טלפון": s.phone || "",
      "תחום עניין": s.interest_category || "",
      "תאריך הרשמה": new Date(s.created_at).toLocaleDateString("he-IL"),
      "סטטוס": s.is_active ? "פעיל" : "לא פעיל",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "נרשמים");
    XLSX.writeFile(wb, `agendax-newsletter-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const activeCount = subscribers.filter((s) => s.is_active).length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Composer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            שליחת ניוזלטר
          </CardTitle>
          <CardDescription>
            העיתון נבנה אוטומטית מהכתבות שתבחר (או מהטריות ביותר), בעיצוב המותג, ונשלח דרך Resend.
            ניוזלטר לקטגוריה נשלח לנרשמי הקטגוריה ולנרשמי "כללי".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
            <Input
              placeholder='נושא המייל (למשל: "Agendax — סיכום היום בהייטק")'
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="קטגוריית ניוזלטר"
            >
              <option value="">כל הקטגוריות</option>
              {liveCategories.map((c) => (
                <option key={c.slug} value={c.name}>
                  ניוזלטר {c.name}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            placeholder="פסקת פתיחה (לא חובה)"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            className="min-h-[70px]"
          />

          {/* Article picker */}
          <div>
            <p className="text-sm font-medium mb-2">
              בחירת כתבות <span className="text-muted-foreground font-normal">(ללא בחירה — 5 הטריות{category ? ` מ${category}` : ""})</span>
            </p>
            <div className="max-h-56 overflow-y-auto space-y-1 border rounded-lg p-2">
              {recentPublished.map((a) => (
                <label key={a.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer text-sm">
                  <Checkbox
                    checked={pickedIds.includes(a.id)}
                    onCheckedChange={(v) =>
                      setPickedIds((ids) => (v ? [...ids, a.id] : ids.filter((x) => x !== a.id)))
                    }
                  />
                  <span className="line-clamp-1 flex-1">{a.title}</span>
                  <Badge variant="outline" className="shrink-0 text-xs">{a.category}</Badge>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              placeholder="מייל לבדיקה"
              dir="ltr"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-56"
            />
            <Button variant="outline" onClick={() => doSend(true)} disabled={isSending} className="gap-2">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
              שלח בדיקה
            </Button>
            <Button onClick={() => doSend(false)} disabled={isSending} className="gap-2 mr-auto">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שלח לכל הנרשמים
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Send history */}
      {sends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              היסטוריית שליחות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sends.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 border rounded-lg text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-medium">{s.subject}</span>
                  {s.test && <Badge variant="outline">בדיקה</Badge>}
                  {s.category && <Badge variant="secondary">{s.category}</Badge>}
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {s.recipients_count} נמענים · {s.article_ids.length} כתבות ·{" "}
                    {new Date(s.created_at).toLocaleString("he-IL")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscribers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              נרשמים ({activeCount} פעילים / {subscribers.length})
            </CardTitle>
            <CardDescription>כיבוי המתג משבית קבלת מיילים בלי למחוק את הנרשם</CardDescription>
          </div>
          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <Download className="w-4 h-4" />
            ייצוא Excel
          </Button>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">אין נרשמים עדיין</p>
          ) : (
            <div className="space-y-2">
              {subscribers.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Switch
                    checked={sub.is_active}
                    onCheckedChange={() => toggleActive(sub)}
                    aria-label={sub.is_active ? "השבת נרשם" : "הפעל נרשם"}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {sub.full_name || sub.email}
                      {!sub.is_active && (
                        <Badge variant="outline" className="mr-2 text-xs">מושבת</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">
                      {sub.email}
                      {sub.phone ? ` · ${sub.phone}` : ""}
                    </p>
                  </div>
                  {sub.interest_category && (
                    <Badge variant="secondary" className="shrink-0">{sub.interest_category}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(sub.created_at).toLocaleDateString("he-IL")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteSubscriber(sub)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminNewsletterTab;
