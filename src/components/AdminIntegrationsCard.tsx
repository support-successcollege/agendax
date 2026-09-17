import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Loader2, Save, Trash2, Wand2 } from "lucide-react";

/**
 * Where the site's third-party keys are entered, so that switching a provider
 * on no longer means opening the Supabase dashboard.
 *
 * The value is written and never read back. There is no SELECT policy on the
 * table at all, so the key cannot travel to this screen even for the admin who
 * typed it — the panel only ever sees whether a key exists and its last four
 * characters. That is deliberate: a key that is never rendered cannot leak
 * through a screenshot, a screen share or a browser extension.
 *
 * It is not encrypted at rest, though: it is stored as written and guarded by
 * row-level security, so it does reach the database's backups. That is why the
 * card still points at Supabase's secret store as the stronger place.
 *
 * A key set in Supabase's own secret store still wins over anything typed here.
 * The secret store is the stronger place — the value never reaches the database
 * or its backups — so a key already living there keeps working untouched.
 */

type SecretRow = {
  key: string;
  is_set: boolean;
  preview: string;
  updated_at: string | null;
};

type FieldSpec = {
  key: string;
  label: string;
  help: string;
  where: string;
};

const FIELDS: FieldSpec[] = [
  {
    key: "PEXELS_API_KEY",
    label: "Pexels",
    help: "גיבוי לתמונות: תצלום אמיתי כשהיצירה ב-Gemini נכשלת או שהמכסה נגמרה. חינם, 200 בקשות בשעה.",
    where: "pexels.com/api",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    help: "כתיבה, עריכה ובחירת מילות החיפוש לתמונה.",
    where: "console.anthropic.com",
  },
  {
    key: "GEMINI_API_KEY",
    label: "Google Gemini",
    help: "יצירת התמונה לכתבה — המקור הראשון — וגיבוי לכתיבה.",
    where: "ai.studio",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI",
    help: "לא בשימוש כרגע - שמור כאן אם תרצה להוסיף אותו כספק תמונות נוסף.",
    where: "platform.openai.com",
  },
];

const AdminIntegrationsCard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["integration-secrets"],
    queryFn: async (): Promise<SecretRow[]> => {
      const { data, error } = await supabase.rpc("integration_secrets_status");
      if (error) throw error;
      return (data ?? []) as SecretRow[];
    },
  });

  const status = new Map(rows.map((r) => [r.key, r]));

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.rpc("set_integration_secret", { p_key: key, p_value: value });
      if (error) throw error;
    },
    onSuccess: (_data, { key, value }) => {
      setDrafts((prev) => ({ ...prev, [key]: "" }));
      queryClient.invalidateQueries({ queryKey: ["integration-secrets"] });
      toast({
        title: value ? "המפתח נשמר" : "המפתח נמחק",
        description: value
          ? "הוא נכנס לתוקף בהרצה הבאה של הסוכן - אין צורך לפרסם מחדש."
          : "המערכת תחזור להשתמש במה שמוגדר בסודות של Supabase, אם יש שם משהו.",
      });
    },
    onError: (error) => {
      toast({
        title: "השמירה נכשלה",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    },
  });

  /**
   * The point of a test button here: a key is only really "saved" once
   * something has used it successfully. This runs the repair worker on one
   * article that is actually missing a photo and reports back what happened,
   * including the provider that answered.
   */
  const runTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("article-image", {
        body: { sweep: true, max: 1 },
      });
      if (error) throw error;
      const handled = (data?.handled ?? []) as { ok?: boolean; source?: string; error?: string }[];
      const pending = Number(data?.pending ?? 0);

      if (pending === 0) {
        toast({ title: "אין מה לבדוק", description: "לכל הכתבות יש תמונה משלהן כרגע." });
        return;
      }
      const first = handled[0];
      if (first?.ok) {
        toast({ title: "עבד", description: `נמצאה תמונה דרך ${first.source}. נשארו ${pending - 1} כתבות בתור.` });
      } else {
        toast({
          title: "עדיין לא",
          description: first?.error?.slice(0, 300) || "הפונקציה לא החזירה סיבה",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "הבדיקה נכשלה",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
      queryClient.invalidateQueries({ queryKey: ["integration-secrets"] });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          מפתחות לשירותים חיצוניים
        </CardTitle>
        <CardDescription>
          המפתח נשמר בבסיס הנתונים ואי אפשר לקרוא אותו חזרה מהמסך הזה - רואים רק אם הוא קיים
          ואת ארבע הספרות האחרונות. מפתח שמוגדר בסודות של Supabase גובר על מה שנשמר כאן, ושם
          הוא גם לא נכנס לבסיס הנתונים ולגיבויים שלו - אז למפתח קריטי זה עדיין המקום העדיף.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            טוען...
          </div>
        ) : (
          FIELDS.map((field) => {
            const row = status.get(field.key);
            const draft = drafts[field.key] ?? "";
            const busy = save.isPending && save.variables?.key === field.key;
            return (
              <div key={field.key} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{field.label}</span>
                  {row?.is_set ? (
                    <Badge variant="secondary" className="gap-1">
                      מוגדר
                      <span dir="ltr" className="font-mono text-[11px]">{row.preview}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline">לא מוגדר</Badge>
                  )}
                  <span className="text-xs text-muted-foreground" dir="ltr">{field.where}</span>
                </div>

                <p className="text-xs text-muted-foreground leading-snug">{field.help}</p>

                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    dir="ltr"
                    autoComplete="off"
                    placeholder={row?.is_set ? "הדבק מפתח חדש כדי להחליף" : "הדבק כאן את המפתח"}
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="flex-1 font-mono text-xs"
                    aria-label={`מפתח ${field.label}`}
                  />
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={busy || !draft.trim()}
                    onClick={() => save.mutate({ key: field.key, value: draft.trim() })}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    שמור
                  </Button>
                  {row?.is_set && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      disabled={busy}
                      onClick={() => save.mutate({ key: field.key, value: "" })}
                      aria-label={`מחק את המפתח של ${field.label}`}
                      title="מחק"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={testing} onClick={runTest}>
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            בדוק על כתבה אמיתית
          </Button>
          <span className="text-xs text-muted-foreground">
            מריץ את משלים התמונות על כתבה אחת שחסרה לה תמונה, ומדווח מי ענה.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminIntegrationsCard;
