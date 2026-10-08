import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  MessageSquareReply,
  Pause,
  Play,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";

/**
 * "הגיבו גוגל ואשלח לכם את הכתבה" — the comment-to-DM automation.
 *
 * Three things have to be true before a single DM goes out, and the panel says
 * which one is missing rather than looking enabled: the webhook address has to
 * be registered at Meta with the verify token, the app secret has to be here
 * (every delivery is checked against it), and the page has to be subscribed to
 * its own comments. The last of those has an API and is a button here; the
 * first is a form in Meta's dashboard, so the card hands over the exact values
 * to paste.
 *
 * The rules themselves are created by the publisher, not here: a post that
 * asks for a word arms the rule for its own post id, so the word a reader is
 * promised and the word the webhook listens for cannot drift apart.
 */

type Settings = {
  dm_automation: boolean;
  dm_public_reply: boolean;
  dm_window_days: number;
  dm_message_template: string;
  dm_message_format: "text" | "button";
  dm_button_label: string;
};

type Rule = {
  id: string;
  platform: string;
  keywords: string[];
  status: string;
  expires_at: string;
  matched_count: number;
  sent_count: number;
  link_url: string;
  articles: { title: string } | null;
};

type Event = {
  comment_id: string;
  platform: string;
  comment_text: string | null;
  matched: boolean;
  sent: boolean;
  error: string | null;
  created_at: string;
};

type Check = {
  webhookUrl: string;
  appSecretSet: boolean;
  verifyTokenSet: boolean;
  pageConnected: boolean;
  instagramConnected: boolean;
  subscribedFields: string[] | null;
  subscriptionError: string | null;
  appSubscriptions: Record<string, { fields: string[]; callbackUrl: string; active: boolean }> | null;
  scopes: string[] | null;
  tokenExpiresAt?: string;
};

/** What a working setup needs on the token and on each webhook object. */
const NEEDED_SCOPES = [
  "pages_manage_metadata",
  "pages_messaging",
  // Writing the public reply under a comment on the page's own post. Not
  // pages_read_engagement, which only reads it.
  "pages_manage_engagement",
  "instagram_manage_comments",
  "instagram_manage_messages",
];

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "אינסטגרם",
  facebook: "פייסבוק",
  instagram_story: "סטורי אינסטגרם",
  facebook_story: "סטורי פייסבוק",
};

const DEFAULTS: Settings = {
  dm_automation: false,
  dm_public_reply: true,
  dm_window_days: 7,
  dm_message_template: "היי! הנה הכתבה המלאה 📩\n\n{title}\n{link}",
  dm_message_format: "text",
  dm_button_label: "לכתבה המלאה",
};

const AdminDmAutomationCard = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [check, setCheck] = useState<Check | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [userToken, setUserToken] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, rulesRes, eventsRes] = await Promise.all([
      supabase
        .from("social_settings")
        .select(
          "dm_automation, dm_public_reply, dm_window_days, dm_message_template, dm_message_format, dm_button_label",
        )
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("social_automations")
        .select("id, platform, keywords, status, expires_at, matched_count, sent_count, link_url, articles(title)")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("social_automation_events")
        .select("comment_id, platform, comment_text, matched, sent, error, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    if (settingsRes.data) {
      setSettings({
        dm_automation: settingsRes.data.dm_automation ?? false,
        dm_public_reply: settingsRes.data.dm_public_reply ?? true,
        dm_window_days: settingsRes.data.dm_window_days ?? 7,
        dm_message_template: settingsRes.data.dm_message_template || DEFAULTS.dm_message_template,
        dm_message_format: settingsRes.data.dm_message_format === "button" ? "button" : "text",
        dm_button_label: settingsRes.data.dm_button_label || DEFAULTS.dm_button_label,
      });
    }
    setRules((rulesRes.data ?? []) as unknown as Rule[]);
    setEvents((eventsRes.data ?? []) as Event[]);
    try {
      setCheck(await invokeEdge<Check>("meta-automations", { action: "check" }));
    } catch {
      setCheck(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("social_settings")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: settings.dm_automation ? "האוטומציה פעילה" : "האוטומציה כבויה",
      description: settings.dm_automation
        ? "הפוסטים הבאים לפייסבוק ואינסטגרם יבקשו מילת קוד, ומי שיגיב יקבל את הכתבה בפרטי."
        : "פוסטים חדשים לא יבקשו תגובה. כללים שכבר רצים ימשיכו עד שיפוג תוקפם.",
    });
  };

  const saveSecret = async (key: string) => {
    const value = (secretDrafts[key] ?? "").trim();
    if (!value) return;
    const { error } = await supabase.rpc("set_integration_secret", { p_key: key, p_value: value });
    if (error) {
      toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    setSecretDrafts((prev) => ({ ...prev, [key]: "" }));
    toast({ title: "נשמר", description: "הערך לא מוצג חזרה — רק אם הוא מוגדר." });
    void load();
  };

  const subscribe = async () => {
    setSubscribing(true);
    try {
      const data = await invokeEdge<{ subscribed: string[] }>("meta-automations", { action: "subscribe" });
      toast({ title: "העמוד חובר לוובהוק", description: data.subscribed.join(", ") });
      await load();
    } catch (error) {
      toast({
        title: "החיבור נכשל",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSubscribing(false);
    }
  };

  const exchangeToken = async () => {
    setExchanging(true);
    try {
      const data = await invokeEdge<{ page: string; expiresAt: string; scopes: string[] }>(
        "meta-automations",
        { action: "exchangeToken", userToken: userToken.trim() },
      );
      setUserToken("");
      toast({
        title: "הטוקן הוחלף",
        description: `${data.page} · תפוגה: ${data.expiresAt === "never" ? "לא פג" : new Date(data.expiresAt).toLocaleString("he-IL")}`,
      });
      await load();
    } catch (error) {
      toast({
        title: "ההחלפה נכשלה",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setExchanging(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await invokeEdge<{
        matched: boolean;
        keyword?: string;
        platform?: string;
        title?: string;
        checked?: number;
      }>("meta-automations", { action: "test", text: testText });
      setTestResult(
        data.matched
          ? `התאמה: "${data.keyword}" → ${PLATFORM_LABEL[data.platform ?? ""] ?? data.platform} · ${data.title}`
          : `אין התאמה (נבדקו ${data.checked ?? 0} כללים פעילים)`,
      );
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  const setRuleStatus = async (id: string, status: "active" | "paused") => {
    const { error } = await supabase
      .from("social_automations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    void load();
  };

  const removeRule = async (id: string) => {
    const { error } = await supabase.from("social_automations").delete().eq("id", id);
    if (error) {
      toast({ title: "המחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הכלל נמחק", description: "הפוסט עצמו נשאר באוויר ועדיין מבקש את המילה." });
    void load();
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "הועתק" });
  };

  const missingScopes = NEEDED_SCOPES.filter((p) => check?.scopes && !check.scopes.includes(p));
  const tokenLooksPermanent = check?.tokenExpiresAt === "never";

  // The app's own subscription is the half that used to be invisible: a page
  // can be subscribed to an app that asked for no fields, and nothing anywhere
  // says so.
  const appFieldsOk =
    (check?.appSubscriptions?.page?.fields?.includes("feed") ?? false) &&
    (check?.appSubscriptions?.instagram?.fields?.includes("comments") ?? false);

  const ready =
    !!check?.appSecretSet &&
    !!check?.verifyTokenSet &&
    !!check?.subscribedFields?.includes("feed") &&
    appFieldsOk;

  const Step = ({ done, children }: { done: boolean; children: React.ReactNode }) => (
    <div className="flex items-start gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareReply className="h-5 w-5 text-primary" />
          תגובה בפוסט ← הכתבה בפרטי
          {ready && settings.dm_automation && <Badge className="bg-emerald-600">פעיל</Badge>}
        </CardTitle>
        <CardDescription>
          כל פוסט לפייסבוק ולאינסטגרם מקבל מילת קוד משלו לפי נושא הכתבה ("הגיבו גוגל"), ומי שמגיב אותה
          מקבל את הקישור בהודעה פרטית. מטא מרשה הודעה פרטית אחת לכל תגובה, בתוך שבעה ימים ממנה — ולכן
          לכל כלל יש תפוגה, ואף אחד שלא הגיב לא מקבל מאיתנו הודעה.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---------- setup ---------- */}
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">חיבור חד-פעמי</p>

          <Step done={!!check?.verifyTokenSet && !!check?.appSecretSet}>
            <p>
              ב-developers.facebook.com → האפליקציה → Webhooks: הדבק את הכתובת ואת ה-Verify Token,
              וסמן את השדות <span dir="ltr">comments</span> ו-<span dir="ltr">messages</span> (גם ל-Instagram וגם ל-Page).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs" dir="ltr">
                {check?.webhookUrl ?? "…"}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={!check?.webhookUrl}
                onClick={() => copy(check!.webhookUrl)}
              >
                <Copy className="h-3 w-3" />
                העתק
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                { key: "META_VERIFY_TOKEN", label: "Verify Token", set: check?.verifyTokenSet, hint: "מילה שאתה בוחר, ומדביק גם כאן וגם אצל מטא" },
                { key: "META_APP_SECRET", label: "App Secret", set: check?.appSecretSet, hint: "Settings → Basic → App Secret" },
              ].map((field) => (
                <div key={field.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{field.label}</span>
                    {field.set ? (
                      <Badge variant="outline" className="h-5 border-emerald-500/40 px-1.5 text-[10px] text-emerald-600">
                        מוגדר
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        חסר
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      type="password"
                      dir="ltr"
                      className="h-8 text-xs"
                      placeholder={field.set ? "••••••  (החלפה)" : field.hint}
                      value={secretDrafts[field.key] ?? ""}
                      onChange={(e) => setSecretDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 px-2"
                      disabled={!(secretDrafts[field.key] ?? "").trim()}
                      onClick={() => saveSecret(field.key)}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                </div>
              ))}
            </div>
          </Step>

          <Step done={tokenLooksPermanent && missingScopes.length === 0}>
            <p>
              טוקן עמוד שלא פג, עם ההרשאות שהאוטומציה צריכה.
              {check?.tokenExpiresAt && check.tokenExpiresAt !== "never" && (
                <span className="text-destructive">
                  {" "}הטוקן הנוכחי פג ב-{new Date(check.tokenExpiresAt).toLocaleString("he-IL")}.
                </span>
              )}
              {missingScopes.length > 0 && (
                <span className="text-destructive"> חסרות הרשאות: <span dir="ltr">{missingScopes.join(", ")}</span>.</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              ב-Graph API Explorer הפק <b>User Token</b> עם ההרשאות, הדבק אותו כאן, ואני מאריך אותו
              ושומר את טוקן העמוד הקבוע בשתי הרשתות. טוקן שמודבק ישירות מה-Explorer פג בתוך שעה.
            </p>
            <div className="mt-2 flex gap-1.5">
              <Input
                type="password"
                dir="ltr"
                className="h-8 text-xs"
                placeholder="User Token מה-Graph API Explorer"
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1 px-2 text-xs"
                disabled={exchanging || !userToken.trim()}
                onClick={exchangeToken}
              >
                {exchanging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                החלף לקבוע
              </Button>
            </div>
          </Step>

          <Step done={!!check?.subscribedFields?.includes("feed")}>
            <div className="flex flex-wrap items-center gap-2">
              <span>הרשמת העמוד לקבלת התגובות שלו</span>
              {check?.subscribedFields && check.subscribedFields.length > 0 && (
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {check.subscribedFields.join(", ")}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={subscribing || !check?.pageConnected}
                onClick={subscribe}
              >
                {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                חבר עכשיו
              </Button>
            </div>
            {check?.appSubscriptions && (
              <p className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
                {Object.entries(check.appSubscriptions)
                  .filter(([object]) => object === "page" || object === "instagram")
                  .map(([object, info]) => `${object}: ${info.fields.join("/") || "—"}`)
                  .join("  ·  ")}
              </p>
            )}
            {check?.subscriptionError && (
              <p className="mt-1 text-xs text-destructive">{check.subscriptionError}</p>
            )}
            {!check?.pageConnected && (
              <p className="mt-1 text-xs text-muted-foreground">חבר קודם את עמוד הפייסבוק בכרטיס הרשתות למעלה.</p>
            )}
          </Step>

          <Step done={!!check?.instagramConnected}>
            <span>
              חשבון אינסטגרם מחובר. הודעות פרטיות באינסטגרם דורשות גם את ההרשאה{" "}
              <span dir="ltr">instagram_manage_messages</span> באפליקציה.
            </span>
          </Step>
        </div>

        {/* ---------- settings ---------- */}
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm">
              <span className="font-medium">הפעל את האוטומציה</span>
              <span className="block text-xs text-muted-foreground">
                מוסיף לכל פוסט חדש שורת "הגיבו X" ופותח כלל לאותו פוסט.
              </span>
            </span>
            <Switch
              checked={settings.dm_automation}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, dm_automation: v }))}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm">
              <span className="font-medium">גם תגובה פומבית</span>
              <span className="block text-xs text-muted-foreground">
                "שלחתי לך את הכתבה בפרטי 📩" מתחת לתגובה, כדי שהקורא הבא יראה שזה עובד.
              </span>
            </span>
            <Switch
              checked={settings.dm_public_reply}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, dm_public_reply: v }))}
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium">צורת ההודעה</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-0.5 rounded-md border p-0.5">
                {([
                  ["text", "קישור בסוף"],
                  ["button", "כפתור"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, dm_message_format: value }))}
                    className={`h-7 rounded px-3 text-sm ${
                      settings.dm_message_format === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </span>
              {settings.dm_message_format === "button" && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">כיתוב הכפתור</span>
                  <Input
                    className="h-8 w-44"
                    maxLength={20}
                    value={settings.dm_button_label}
                    onChange={(e) => setSettings((s) => ({ ...s, dm_button_label: e.target.value }))}
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              "קישור בסוף" הוא מה שנבדק ועובד. "כפתור" נראה טוב יותר ולא תלוי בזיהוי קישור, אבל הוא
              הנתיב הפחות סלול באינסטגרם — אם מטא תסרב לו, נשלחת אוטומטית גרסת הטקסט ואף קורא לא נשאר
              בלי תשובה.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">ההודעה הפרטית</span>
            <Textarea
              rows={5}
              value={settings.dm_message_template}
              onChange={(e) => setSettings((s) => ({ ...s, dm_message_template: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              <code>{"{title}"}</code> = כותרת הכתבה, <code>{"{link}"}</code> = הקישור אליה, והוא תמיד
              מגיע בשורה האחרונה. במצב "כפתור" הקישור יושב על הכפתור והטקסט נשאר בלעדיו.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-sm font-medium">ימי תוקף לכלל</span>
              <Input
                type="number"
                min={1}
                max={7}
                className="h-9 w-24"
                value={settings.dm_window_days}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, dm_window_days: Math.min(7, Math.max(1, Number(e.target.value) || 7)) }))
                }
              />
            </label>
            <p className="flex-1 text-xs text-muted-foreground">
              מעל שבעה ימים מטא מסרבת לשלוח הודעה פרטית על תגובה, ולכן זה גם המקסימום כאן.
            </p>
            <Button onClick={saveSettings} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              שמור
            </Button>
          </div>
        </div>

        {/* ---------- dry run ---------- */}
        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">בדיקת מילה</p>
          <p className="text-xs text-muted-foreground">
            כתוב תגובה כמו שקורא היה כותב אותה, וראה לאיזה כלל היא נופלת. לא נשלחת שום הודעה.
          </p>
          <div className="flex gap-2">
            <Input
              value={testText}
              placeholder="גוגל!"
              onChange={(e) => setTestText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && testText.trim() && runTest()}
            />
            <Button variant="outline" disabled={testing || !testText.trim()} onClick={runTest}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "בדוק"}
            </Button>
          </div>
          {testResult && <p className="text-sm">{testResult}</p>}
        </div>

        {/* ---------- live rules ---------- */}
        <div className="space-y-2">
          <p className="text-sm font-medium">כללים פעילים</p>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין כללים. הם נוצרים לבד בפרסום הבא לפייסבוק או לאינסטגרם, כשהאוטומציה דלוקה.
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <Badge variant="outline" className="shrink-0">
                    {PLATFORM_LABEL[rule.platform] ?? rule.platform}
                  </Badge>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    {rule.keywords[0] ?? "—"}
                  </span>
                  <span className="min-w-[160px] flex-1 truncate" title={rule.articles?.title ?? ""}>
                    {rule.articles?.title ?? "כתבה שנמחקה"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {rule.sent_count}/{rule.matched_count} נשלחו
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    עד {new Date(rule.expires_at).toLocaleDateString("he-IL")}
                  </span>
                  {rule.status !== "active" && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {rule.status === "paused" ? "מושהה" : "פג"}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2"
                    title={rule.status === "active" ? "השהה" : "הפעל"}
                    onClick={() => setRuleStatus(rule.id, rule.status === "active" ? "paused" : "active")}
                  >
                    {rule.status === "active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-destructive"
                    title="מחק כלל"
                    onClick={() => removeRule(rule.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- what came in ---------- */}
        {events.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">תגובות שהגיעו</p>
            <div className="space-y-1.5">
              {events.map((event) => (
                <div key={event.comment_id} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
                  {event.sent ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 break-words">
                    {event.comment_text || "—"}
                    {event.error && <span className="block text-destructive">{event.error}</span>}
                    {!event.error && !event.matched && <span className="text-muted-foreground"> · לא תאם מילת קוד</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {new Date(event.created_at).toLocaleString("he-IL")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminDmAutomationCard;
