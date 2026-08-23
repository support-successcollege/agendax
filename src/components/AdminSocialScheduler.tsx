import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge";
import type { Article } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarClock,
  Clock,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Layers,
  Pencil,
} from "lucide-react";

type Platform = "facebook" | "instagram" | "linkedin" | "x";
const ALL_PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "x"];
const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  linkedin: "לינקדאין",
  x: "X",
};
const PLATFORM_SHORT: Record<Platform, string> = { facebook: "FB", instagram: "IG", linkedin: "LI", x: "X" };
const STORY_PLATFORMS: Platform[] = ["facebook", "instagram"];

interface Settings {
  posts_per_day: number;
  publish_hours: string[];
  auto_fill: boolean;
  auto_stories: boolean;
}

interface QueueItem {
  id: string;
  article_id: string;
  platforms: string[];
  kind: "post" | "story";
  scheduled_at: string;
  status: "queued" | "publishing" | "posted" | "failed" | "cancelled";
  source: "auto" | "manual";
  error: string | null;
  posted_at: string | null;
}

const DEFAULT_SETTINGS: Settings = { posts_per_day: 3, publish_hours: ["09:00", "13:00", "19:00"], auto_fill: true, auto_stories: false };

/** "YYYY-MM-DDTHH:MM" in the browser's local time — what <input type="datetime-local"> wants. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<QueueItem["status"], { text: string; className: string }> = {
  queued: { text: "בתור", className: "bg-sky-100 text-sky-800 border-sky-200" },
  publishing: { text: "מפרסם…", className: "bg-amber-100 text-amber-800 border-amber-200" },
  posted: { text: "פורסם", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed: { text: "נכשל", className: "bg-red-100 text-red-800 border-red-200" },
  cancelled: { text: "בוטל", className: "bg-muted text-muted-foreground" },
};

interface Props {
  articles: Article[];
  enabledPlatforms: Platform[];
  /** Called after anything the history card should refresh for. */
  onChanged?: () => void;
}

const AdminSocialScheduler = ({ articles, enabledPlatforms, onChanged }: Props) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [showDone, setShowDone] = useState(false);

  // Add-to-queue form
  const [newArticle, setNewArticle] = useState("");
  const [newKind, setNewKind] = useState<"post" | "story">("post");
  const [newPlatforms, setNewPlatforms] = useState<Platform[]>([]);
  const [newTime, setNewTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [adding, setAdding] = useState(false);

  const published = useMemo(() => articles.filter((a) => !a.isDraft).slice(0, 60), [articles]);
  const titleOf = (id: string) => articles.find((a) => a.id === id)?.title ?? "כתבה שנמחקה";

  useEffect(() => {
    // Default targets: whatever is connected (stories only FB/IG).
    setNewPlatforms(enabledPlatforms.filter((p) => newKind === "post" || STORY_PLATFORMS.includes(p)));
  }, [enabledPlatforms, newKind]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const [s, q] = await Promise.all([
      supabase.from("social_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("social_queue").select("*").gte("scheduled_at", since).order("scheduled_at", { ascending: true }).limit(200),
    ]);
    if (s.data) {
      setSettings({
        posts_per_day: s.data.posts_per_day,
        publish_hours: s.data.publish_hours ?? [],
        auto_fill: s.data.auto_fill,
        auto_stories: s.data.auto_stories,
      });
    }
    setQueue((q.data ?? []) as QueueItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const saveSettings = async () => {
    setSavingSettings(true);
    const hours = [...new Set(settings.publish_hours.filter((h) => /^\d{2}:\d{2}$/.test(h)))].sort();
    const { error } = await supabase.from("social_settings").upsert(
      { id: 1, ...settings, publish_hours: hours, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    setSavingSettings(false);
    if (error) {
      toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    setSettings((s) => ({ ...s, publish_hours: hours }));
    toast({ title: "הגדרות הלוז נשמרו" });
  };

  const setHour = (i: number, value: string) =>
    setSettings((s) => ({ ...s, publish_hours: s.publish_hours.map((h, j) => (j === i ? value : h)) }));
  const removeHour = (i: number) =>
    setSettings((s) => ({ ...s, publish_hours: s.publish_hours.filter((_, j) => j !== i) }));
  const addHour = () => {
    const last = settings.publish_hours[settings.publish_hours.length - 1] ?? "08:00";
    const [h] = last.split(":").map(Number);
    const next = `${String(Math.min(23, (Number.isFinite(h) ? h : 8) + 3)).padStart(2, "0")}:00`;
    setSettings((s) => ({ ...s, publish_hours: [...s.publish_hours, next] }));
  };

  const addToQueue = async () => {
    if (!newArticle) {
      toast({ title: "בחר כתבה", variant: "destructive" });
      return;
    }
    if (newPlatforms.length === 0) {
      toast({ title: "בחר לפחות פלטפורמה אחת", variant: "destructive" });
      return;
    }
    const at = new Date(newTime);
    if (Number.isNaN(at.getTime())) {
      toast({ title: "מועד לא תקין", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("social_queue").insert({
      article_id: newArticle,
      platforms: newPlatforms,
      kind: newKind,
      scheduled_at: at.toISOString(),
      source: "manual",
    });
    setAdding(false);
    if (error) {
      toast({ title: "ההוספה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "נוסף לתור", description: `${newKind === "story" ? "סטורי" : "פוסט"} · ${at.toLocaleString("he-IL")}` });
    setNewArticle("");
    load();
  };

  const patchItem = async (id: string, patch: Partial<QueueItem>) => {
    setBusyId(id);
    const { error } = await supabase.from("social_queue").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    setBusyId(null);
    if (error) {
      toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const togglePlatform = (item: QueueItem, p: Platform) => {
    const has = item.platforms.includes(p);
    const next = has ? item.platforms.filter((x) => x !== p) : [...item.platforms, p];
    if (next.length === 0) {
      toast({ title: "חייבת להישאר לפחות פלטפורמה אחת", variant: "destructive" });
      return;
    }
    patchItem(item.id, { platforms: next });
  };

  const runNow = async (item: QueueItem) => {
    setBusyId(item.id);
    try {
      const r = await invokeEdge<{ ok: boolean; results?: { platform: string; ok: boolean; error?: string }[]; error?: string }>(
        "social-publish",
        { queueId: item.id },
      );
      const failed = (r.results ?? []).filter((x) => !x.ok);
      if (r.ok && failed.length === 0) toast({ title: "פורסם!" });
      else toast({ title: r.ok ? "פורסם חלקית" : "הפרסום נכשל", description: (failed.map((f) => `${f.platform}: ${f.error}`).join(" · ") || r.error || "").slice(0, 300), variant: "destructive" });
    } catch (e) {
      toast({ title: "הפרסום נכשל", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusyId(null);
      load();
      onChanged?.();
    }
  };

  const remove = async (item: QueueItem) => {
    setBusyId(item.id);
    const { error } = await supabase.from("social_queue").delete().eq("id", item.id);
    setBusyId(null);
    if (error) {
      toast({ title: "המחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const upcoming = queue.filter((q) => q.status === "queued" || q.status === "publishing" || q.status === "failed");
  const done = queue.filter((q) => q.status === "posted" || q.status === "cancelled").slice(-20).reverse();
  const groups = useMemo(() => {
    const m = new Map<string, QueueItem[]>();
    for (const q of upcoming) {
      const k = dayKey(q.scheduled_at);
      m.set(k, [...(m.get(k) ?? []), q]);
    }
    return [...m.entries()];
  }, [upcoming]);

  const effectiveSlots = settings.publish_hours.slice(0, settings.posts_per_day);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const renderItem = (item: QueueItem, compact = false) => {
    const st = STATUS_LABEL[item.status];
    const busy = busyId === item.id;
    const editable = item.status === "queued" || item.status === "failed";
    return (
      <div key={item.id} className={`flex flex-wrap items-center gap-2 p-2.5 border rounded-lg text-sm ${item.status === "failed" ? "border-red-200 bg-red-50/40" : ""}`}>
        {/* time */}
        {editingId === item.id ? (
          <span className="flex items-center gap-1">
            <Input
              type="datetime-local"
              dir="ltr"
              className="h-8 w-[190px] text-xs"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => {
                const d = new Date(editTime);
                if (Number.isNaN(d.getTime())) return;
                patchItem(item.id, { scheduled_at: d.toISOString(), status: "queued", error: null } as Partial<QueueItem>);
                setEditingId(null);
              }}
            >
              שמור
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </span>
        ) : (
          <button
            type="button"
            disabled={!editable}
            title={editable ? "שנה מועד" : undefined}
            onClick={() => {
              setEditingId(item.id);
              setEditTime(toLocalInput(new Date(item.scheduled_at)));
            }}
            className={`flex items-center gap-1 font-semibold tabular-nums ${editable ? "hover:text-primary" : ""}`}
          >
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            {timeLabel(item.scheduled_at)}
            {!compact && <span className="text-[11px] text-muted-foreground font-normal">({new Date(item.scheduled_at).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})</span>}
            {editable && <Pencil className="w-3 h-3 text-muted-foreground" />}
          </button>
        )}

        <Badge variant="outline" className={`gap-1 ${item.kind === "story" ? "border-fuchsia-300 text-fuchsia-700" : ""}`}>
          {item.kind === "story" ? <Layers className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
          {item.kind === "story" ? "סטורי" : "פוסט"}
        </Badge>
        <Badge variant="outline" className={st.className}>{st.text}</Badge>
        {item.source === "auto" && <Badge variant="secondary" className="text-[10px]">אוטו</Badge>}

        <span className="flex-1 min-w-[160px] truncate font-medium" title={titleOf(item.article_id)}>
          {titleOf(item.article_id)}
        </span>

        {/* platforms */}
        <span className="flex items-center gap-1">
          {(item.kind === "story" ? STORY_PLATFORMS : ALL_PLATFORMS).map((p) => {
            const on = item.platforms.includes(p);
            const connected = enabledPlatforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                disabled={!editable || busy}
                title={`${PLATFORM_LABEL[p]}${connected ? "" : " (לא מחובר)"}`}
                onClick={() => togglePlatform(item, p)}
                className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                  on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
                } ${connected ? "" : "opacity-40"}`}
              >
                {PLATFORM_SHORT[p]}
              </button>
            );
          })}
        </span>

        {editable && (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" disabled={busy} onClick={() => runNow(item)}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              פרסם עכשיו
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => patchItem(item.id, { status: "cancelled" })}>
              בטל
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-1.5 text-destructive" disabled={busy} title="מחק" onClick={() => remove(item)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </span>
        )}
        {item.status === "cancelled" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => patchItem(item.id, { status: "queued" })}>
            החזר לתור
          </Button>
        )}
        {item.error && <p className="w-full text-xs text-destructive break-words">{item.error}</p>}
      </div>
    );
  };

  return (
    <>
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            לוז פרסומים ברשתות
          </CardTitle>
          <CardDescription>
            כמה פוסטים ביום ובאילו שעות. המערכת ממלאת את השעות הפנויות של היום ומחר בכתבות הטריות
            ביותר (פלטפורמות עם "אוטומטי" דולק), ואפשר להוסיף, להזיז ולבטל פריטים בתור למטה.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={settings.auto_fill} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_fill: v }))} />
              מילוי אוטומטי של התור
            </label>
            <label className="flex items-center gap-2 text-sm">
              פרסומים ביום
              <Input
                type="number"
                min={0}
                max={24}
                dir="ltr"
                className="h-8 w-16 text-center"
                value={settings.posts_per_day}
                onChange={(e) => setSettings((s) => ({ ...s, posts_per_day: Math.max(0, Math.min(24, Number(e.target.value) || 0)) }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={settings.auto_stories} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_stories: v }))} />
              גם סטורי אוטומטי (פייסבוק/אינסטגרם, 5 דק' אחרי הפוסט)
            </label>
          </div>

          <div>
            <p className="text-sm mb-2">שעות פרסום (שעון ישראל):</p>
            <div className="flex flex-wrap items-center gap-2">
              {settings.publish_hours.map((h, i) => (
                <span key={i} className={`flex items-center gap-1 border rounded-md pr-1 ${i < settings.posts_per_day ? "" : "opacity-50"}`} title={i < settings.posts_per_day ? "" : "מעבר למכסה היומית — לא בשימוש"}>
                  <Input type="time" dir="ltr" className="h-8 w-[104px] border-0 shadow-none" value={h} onChange={(e) => setHour(i, e.target.value)} />
                  <button type="button" className="text-muted-foreground hover:text-destructive px-1" onClick={() => removeHour(i)} aria-label="הסר שעה">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addHour}>
                <Plus className="w-3.5 h-3.5" /> שעה
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              בפועל: {effectiveSlots.length === 0 ? "אין פרסומים אוטומטיים" : `${effectiveSlots.length} ביום בשעות ${effectiveSlots.join(", ")}`}
              {settings.publish_hours.length < settings.posts_per_day && " · הוסף שעות כדי להגיע למכסה"}
            </p>
          </div>

          <Button size="sm" className="gap-1.5" disabled={savingSettings} onClick={saveSettings}>
            {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            שמור הגדרות לוז
          </Button>
        </CardContent>
      </Card>

      {/* Add to queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            הוספה לתור
          </CardTitle>
          <CardDescription>בחר כתבה, פוסט או סטורי, פלטפורמות ומועד — ויעלה אוטומטית בזמן.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={newArticle}
            onChange={(e) => setNewArticle(e.target.value)}
            aria-label="כתבה לתור"
          >
            <option value="">בחר כתבה...</option>
            {published.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1 border rounded-md p-0.5">
              {(["post", "story"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNewKind(k)}
                  className={`px-3 h-7 rounded text-sm ${newKind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {k === "post" ? "פוסט" : "סטורי"}
                </button>
              ))}
            </span>
            {(newKind === "story" ? STORY_PLATFORMS : ALL_PLATFORMS).map((p) => (
              <label key={p} className={`flex items-center gap-1.5 text-sm ${enabledPlatforms.includes(p) ? "" : "opacity-40 pointer-events-none"}`}>
                <Checkbox
                  checked={newPlatforms.includes(p)}
                  onCheckedChange={(v) => setNewPlatforms((t) => (v ? [...t, p] : t.filter((x) => x !== p)))}
                />
                {PLATFORM_LABEL[p]}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm mr-auto">
              מועד
              <Input type="datetime-local" dir="ltr" className="h-8 w-[200px]" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </label>
          </div>
          <Button size="sm" className="gap-1.5" disabled={adding || enabledPlatforms.length === 0} onClick={addToQueue}>
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            הוסף לתור
          </Button>
        </CardContent>
      </Card>

      {/* Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            התור הקרוב
            <Badge variant="secondary" className="mr-1">{upcoming.length}</Badge>
          </CardTitle>
          <CardDescription>לחיצה על השעה משנה מועד; לחיצה על קיצור הרשת מוסיפה/מסירה אותה מהפריט.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">התור ריק. {settings.auto_fill ? "המערכת תמלא אותו בבדיקה הבאה (כל 5 דקות) אם יש כתבות חדשות." : "המילוי האוטומטי כבוי — הוסף פריטים ידנית."}</p>
          ) : (
            groups.map(([day, items]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">{day}</p>
                <div className="space-y-1.5">{items.map((i) => renderItem(i, true))}</div>
              </div>
            ))
          )}
          {done.length > 0 && (
            <div className="pt-2 border-t">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => setShowDone((v) => !v)}>
                {showDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 rotate-45" />}
                {showDone ? "הסתר" : "הצג"} פריטים שהושלמו/בוטלו ({done.length})
              </button>
              {showDone && <div className="space-y-1.5 mt-2">{done.map((i) => renderItem(i))}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default AdminSocialScheduler;
