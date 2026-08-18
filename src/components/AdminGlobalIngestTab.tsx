import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scanGlobalTech, runIngestWorker, type IngestScanResult, type IngestWorkerResult } from "@/lib/ai.functions";
import {
  useCategoryStats,
  useIngestItems,
  useIngestRuns,
  useIngestStats,
  useNewsSources,
  useRefreshIngest,
  updateDailyTarget,
  type IngestBucket,
  type IngestItem,
  type NewsSource,
} from "@/hooks/useGlobalIngest";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import {
  Globe,
  Loader2,
  Play,
  RefreshCw,
  Rss,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Target,
  Trash2,
  Plus,
  RotateCcw,
} from "lucide-react";

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "בתור", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  processing: { label: "בכתיבה", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  published: { label: "טיוטה נוצרה", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  failed: { label: "נכשל", className: "bg-destructive/10 text-destructive border-destructive/30" },
  skipped: { label: "בוטל", className: "bg-muted text-muted-foreground border-border" },
  seen: { label: "נסרק", className: "bg-muted text-muted-foreground border-border" },
};

const relativeTime = (iso: string | null) => {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  return `לפני ${Math.round(hours / 24)} ימים`;
};

const AdminGlobalIngestTab = () => {
  const { toast } = useToast();
  const { categories } = useCategories();
  const refresh = useRefreshIngest();

  const { data: sources = [], isLoading: loadingSources } = useNewsSources();
  const { data: items = [] } = useIngestItems();
  const { data: runs = [] } = useIngestRuns();
  const { data: stats } = useIngestStats();
  const { data: categoryStats = [] } = useCategoryStats();

  const [isScanning, setIsScanning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastScan, setLastScan] = useState<IngestScanResult | null>(null);
  const [targetDraft, setTargetDraft] = useState<string>("");
  const [savingTarget, setSavingTarget] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [newSource, setNewSource] = useState<{
    name: string;
    feedUrl: string;
    bucket: IngestBucket;
    weight: number;
  }>({ name: "", feedUrl: "", bucket: "", weight: 5 });

  const queue = useMemo(() => items.filter((i) => i.status === "pending" || i.status === "processing"), [items]);
  const done = useMemo(() => items.filter((i) => i.status === "published"), [items]);
  const failed = useMemo(() => items.filter((i) => i.status === "failed"), [items]);

  // The activity-list status filter: "in progress" covers both queued and
  // currently-writing items, because to the editor they are one bucket of
  // "not done yet".
  const [itemFilter, setItemFilter] = useState<"all" | "inprogress" | "done" | "failed">("all");
  const filteredItems = useMemo(() => {
    switch (itemFilter) {
      case "inprogress":
        return queue;
      case "done":
        return done;
      case "failed":
        return failed;
      default:
        return items;
    }
  }, [itemFilter, items, queue, done, failed]);

  const totalTarget = (stats?.dailyTarget ?? 10) * (stats?.categoryCount ?? 1);

  // Sources group under the site's own categories; labels and order come from
  // the live categories table, and unknown buckets (renamed slugs, old rows)
  // trail at the end under their raw slug instead of disappearing.
  const liveCategories = useMemo(
    () => categories.filter((c) => c.slug !== "home" && c.isActive),
    [categories],
  );
  const categoryName = (slug: string) =>
    liveCategories.find((c) => c.slug === slug)?.name ?? slug;

  const byBucket = useMemo(() => {
    const groups = new Map<IngestBucket, NewsSource[]>();
    for (const s of sources) {
      const list = groups.get(s.bucket) ?? [];
      list.push(s);
      groups.set(s.bucket, list);
    }
    const order = liveCategories.map((c) => c.slug);
    return [...groups.entries()].sort(
      (a, b) =>
        (order.indexOf(a[0]) + 1 || order.length + 1) -
        (order.indexOf(b[0]) + 1 || order.length + 1),
    );
  }, [sources, liveCategories]);

  const handleScan = async (dryRun: boolean) => {
    const setBusy = dryRun ? setIsTesting : setIsScanning;
    setBusy(true);
    try {
      // No explicit limit: the scanner tops up each category toward its own
      // daily quota, so the pacing lives server-side.
      const result = await scanGlobalTech({ data: { dryRun } });
      setLastScan(result);
      refresh();
      toast({
        title: dryRun ? "בדיקת מקורות הושלמה" : "הסריקה הושלמה",
        description: dryRun
          ? `${result.sources?.filter((s) => s.ok).length ?? 0} מקורות תקינים, ${result.itemsNew ?? 0} ידיעות חדשות`
          : result.skipped
            ? `${result.skipped} (${result.publishedToday}/${result.dailyTarget})`
            : `${result.itemsNew ?? 0} ידיעות חדשות, ${result.queued ?? 0} נבחרו לכתיבה`,
      });
    } catch (error) {
      toast({
        title: dryRun ? "בדיקת המקורות נכשלה" : "הסריקה נכשלה",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleWork = async () => {
    setIsWorking(true);
    try {
      const result: IngestWorkerResult = await runIngestWorker({ data: { max: 1 } });
      refresh();
      if (result.created.length > 0) {
        toast({
          title: "נוצרה טיוטה חדשה",
          description: `${result.created[0].title} — נמצאת בטאב "כתבות" לאישור`,
        });
      } else {
        toast({
          title: result.skipped ? "היעד היומי הושלם" : "אין מה לכתוב",
          description:
            result.skipped
              ? `נוצרו ${result.publishedToday} כתבות היום — כל הקטגוריות הגיעו ליעד. הסוכן ימשיך מחר.`
              : (result.notes?.[0] ?? "התור ריק (או שהקטגוריות שנותרו ריקות). הרץ סריקה כדי למלא אותו."),
        });
      }
    } catch (error) {
      toast({
        title: "כתיבת הכתבה נכשלה",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const saveTarget = async () => {
    const value = Number(targetDraft);
    if (!Number.isInteger(value) || value < 1 || value > 50) {
      toast({ title: "ערך לא תקין", description: "יעד יומי חייב להיות מספר שלם בין 1 ל-50.", variant: "destructive" });
      return;
    }
    setSavingTarget(true);
    try {
      await updateDailyTarget(value);
      setTargetDraft("");
      refresh();
      toast({ title: "היעד עודכן", description: `הסוכן יפיק מעכשיו ${value} כתבות ביום לכל קטגוריה.` });
    } catch (error) {
      toast({
        title: "העדכון נכשל",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setSavingTarget(false);
    }
  };

  const toggleSource = async (source: NewsSource) => {
    const { error } = await supabase
      .from("news_sources")
      .update({ is_active: !source.is_active })
      .eq("id", source.id);
    if (error) {
      toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  };

  const addSource = async () => {
    const name = newSource.name.trim();
    const feedUrl = newSource.feedUrl.trim();
    if (!newSource.bucket) {
      toast({ title: "בחר קטגוריה למקור", variant: "destructive" });
      return;
    }
    if (!name || !feedUrl) {
      toast({ title: "חסר שם או כתובת פיד", variant: "destructive" });
      return;
    }
    try {
      new URL(feedUrl);
    } catch {
      toast({ title: "כתובת הפיד אינה URL תקין", variant: "destructive" });
      return;
    }
    setAddingSource(true);
    const { error } = await supabase.from("news_sources").insert({
      name,
      feed_url: feedUrl,
      bucket: newSource.bucket,
      weight: newSource.weight,
    });
    setAddingSource(false);
    if (error) {
      // 23505 = the unique constraint on feed_url — say so in plain words.
      const description =
        error.code === "23505" ? "פיד עם הכתובת הזו כבר קיים" : error.message;
      toast({ title: "ההוספה נכשלה", description, variant: "destructive" });
      return;
    }
    setNewSource({ name: "", feedUrl: "", bucket: "", weight: 5 });
    toast({ title: "המקור נוסף", description: `${name} ייכלל בסריקה הבאה.` });
    refresh();
  };

  const deleteSource = async (source: NewsSource) => {
    // Items already ingested from this source keep their rows (and their
    // articles); deleting a source only stops future scans from reading it.
    if (!window.confirm(`למחוק את "${source.name}" לצמיתות? כתבות שכבר נוצרו ממנו יישארו.`)) {
      return;
    }
    const { error } = await supabase.from("news_sources").delete().eq("id", source.id);
    if (error) {
      toast({ title: "המחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "המקור נמחק", description: source.name });
    refresh();
  };

  const resetQueue = async () => {
    // Deletes only what is waiting to be written. Published rows stay (they
    // anchor the daily quota and link to their articles), `seen` rows stay so
    // the next scan doesn't rediscover old stories, and `skipped` rows stay so
    // dismissed stories don't come back.
    if (
      !window.confirm(
        "לאפס את התור? כל הידיעות שממתינות לכתיבה (כולל כשלונות) יימחקו. כתבות שכבר נוצרו לא ייפגעו.",
      )
    ) {
      return;
    }
    setIsResetting(true);
    const { error, count } = await supabase
      .from("ingest_items")
      .delete({ count: "exact" })
      .in("status", ["pending", "processing", "failed"]);
    setIsResetting(false);
    if (error) {
      toast({ title: "האיפוס נכשל", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "התור אופס",
      description: `${count ?? 0} ידיעות הוסרו. הסריקה הבאה תמלא אותו מחדש.`,
    });
    refresh();
  };

  const dismissItem = async (item: IngestItem) => {
    const { error } = await supabase.from("ingest_items").update({ status: "skipped" }).eq("id", item.id);
    if (error) {
      toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  };

  const retryItem = async (item: IngestItem) => {
    const { error } = await supabase
      .from("ingest_items")
      .update({ status: "pending", attempts: 0, error: null })
      .eq("id", item.id);
    if (error) {
      toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              סוכן חדשות הייטק עולמי
            </CardTitle>
            <CardDescription>
              סורק את אתרי הטכנולוגיה הגדולים בעולם, בוחר את הידיעות החשובות, כותב אותן מחדש בעברית ושומר כטיוטה לאישורך.
              רץ אוטומטית שש פעמים ביום ומשלים את היעד היומי.
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => handleScan(true)} disabled={isTesting} className="gap-2">
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rss className="w-4 h-4" />}
              בדוק מקורות
            </Button>
            <Button onClick={() => handleScan(false)} disabled={isScanning} className="gap-2">
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              סרוק עכשיו
            </Button>
            <Button
              onClick={handleWork}
              disabled={isWorking}
              className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              כתוב את הבאה בתור
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">היום</p>
              <p className="text-2xl font-bold">
                {stats?.publishedToday ?? 0}
                <span className="text-base font-normal text-muted-foreground">/{totalTarget}</span>
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">בתור לכתיבה</p>
              <p className="text-2xl font-bold">{queue.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">מקורות פעילים</p>
              <p className="text-2xl font-bold">
                {sources.filter((s) => s.is_active).length}/{sources.length}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">כשלונות</p>
              <p className="text-2xl font-bold">{failed.length}</p>
            </div>
          </div>

          {/* Per-category progress */}
          {categoryStats.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryStats.map((c) => (
                <Badge
                  key={c.bucket}
                  variant="outline"
                  className={
                    c.publishedToday >= (stats?.dailyTarget ?? 10)
                      ? "border-emerald-500/30 text-emerald-600"
                      : "text-muted-foreground"
                  }
                  title={c.queued > 0 ? `${c.queued} בתור` : undefined}
                >
                  {c.name}: {c.publishedToday}/{stats?.dailyTarget ?? 10}
                  {c.queued > 0 && <span className="opacity-60"> · {c.queued} בתור</span>}
                </Badge>
              ))}
            </div>
          )}

          {/* Daily target */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-[16rem]">
              <p className="text-sm font-medium">
                יעד יומי: {stats?.dailyTarget ?? 10} כתבות לכל קטגוריה
                {stats?.categoryCount ? ` (${totalTarget} סה"כ)` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                כל קטגוריה מקבלת מכסה משלה. כל סריקה משלימה את התור למה שחסר מהיעד בכל קטגוריה, ועוד{" "}
                {stats?.queueBuffer ?? 3} רזרבות. אם ידיעה נכשלת, הרזרבה הבאה נכנסת במקומה במקום שהיום ייצא קצר.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={50}
                inputMode="numeric"
                placeholder={String(stats?.dailyTarget ?? 10)}
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                className="w-24 text-center"
              />
              <Button variant="outline" size="sm" onClick={saveTarget} disabled={savingTarget || !targetDraft}>
                {savingTarget ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור"}
              </Button>
            </div>
          </div>

          {lastScan?.sources && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium mb-2">תוצאת הריצה האחרונה</p>
              <div className="flex flex-wrap gap-2">
                {lastScan.sources.map((s) => (
                  <Badge
                    key={s.name}
                    variant="outline"
                    className={s.ok ? "border-emerald-500/30 text-emerald-600" : "border-destructive/30 text-destructive"}
                    title={s.error}
                  >
                    {s.name}: {s.ok ? `${s.items} ידיעות` : s.error}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-base">התור והפעילות האחרונה</CardTitle>
            <CardDescription>
              כתבה שנכתבה נשמרת כטיוטה. עברו לטאב "כתבות", ערכו אם צריך, ופרסמו.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetQueue}
            disabled={isResetting || (queue.length === 0 && failed.length === 0)}
            className="gap-2 shrink-0 text-muted-foreground hover:text-destructive"
          >
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            אפס תור
          </Button>
        </CardHeader>
        <CardContent>
          {items.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {(
                [
                  { key: "all", label: `הכל (${items.length})` },
                  { key: "inprogress", label: `בתהליך (${queue.length})` },
                  { key: "done", label: `בוצע (${done.length})` },
                  { key: "failed", label: `נכשל (${failed.length})` },
                ] as const
              ).map((f) => (
                <Button
                  key={f.key}
                  variant={itemFilter === f.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setItemFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              עדיין לא נסרקו ידיעות. לחצו "סרוק עכשיו" כדי להתחיל.
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">אין ידיעות בסטטוס הזה.</p>
          ) : (
            <div className="space-y-2">
              {filteredItems.slice(0, 25).map((item) => {
                const meta = STATUS_META[item.status] ?? STATUS_META.seen;
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <Badge variant="outline" className={`shrink-0 ${meta.className}`}>
                      {meta.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-2">{item.source_title}</p>
                      {item.angle && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">זווית: {item.angle}</p>}
                      {item.error && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          {item.error}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{item.source_name}</span>
                        {item.priority > 0 && <span>עדיפות {item.priority}/10</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {relativeTime(item.updated_at)}
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          המקור
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {item.status === "failed" && (
                        <Button variant="outline" size="sm" onClick={() => retryItem(item)} title="נסה שוב">
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      {(item.status === "pending" || item.status === "failed") && (
                        <Button variant="ghost" size="sm" onClick={() => dismissItem(item)} title="הסר מהתור">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">מקורות</CardTitle>
          <CardDescription>כבו מקור כדי להוציא אותו מהסריקה. "בדוק מקורות" מריץ סריקה יבשה בלי לכתוב כלום.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSources ? (
            <p className="text-muted-foreground text-sm">טוען...</p>
          ) : (
            <div className="space-y-6">
              {byBucket.map(([bucket, list]) => (
                <div key={bucket}>
                  <h4 className="font-medium text-sm mb-2">{categoryName(bucket)}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {list.map((source) => (
                      <div key={source.id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Switch checked={source.is_active} onCheckedChange={() => toggleSource(source)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{source.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {source.last_status === "ok" ? (
                              <span className="text-emerald-600 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                {source.last_item_count} ידיעות · {relativeTime(source.last_fetched_at)}
                              </span>
                            ) : source.last_status ? (
                              <span className="text-destructive inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {source.last_status}
                              </span>
                            ) : (
                              "טרם נסרק"
                            )}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {source.weight}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteSource(source)}
                          title="מחק מקור"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Add a source */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">הוספת מקור חדש</h4>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto_auto_auto] gap-2 items-center">
                  <Input
                    placeholder="שם המקור (למשל TechCrunch)"
                    value={newSource.name}
                    onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))}
                  />
                  <Input
                    placeholder="כתובת פיד RSS/Atom"
                    dir="ltr"
                    value={newSource.feedUrl}
                    onChange={(e) => setNewSource((s) => ({ ...s, feedUrl: e.target.value }))}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={newSource.bucket}
                    onChange={(e) =>
                      setNewSource((s) => ({ ...s, bucket: e.target.value as IngestBucket }))
                    }
                    aria-label="קטגוריית מקור"
                  >
                    <option value="" disabled>
                      קטגוריה...
                    </option>
                    {liveCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={newSource.weight}
                    onChange={(e) =>
                      setNewSource((s) => ({ ...s, weight: Number(e.target.value) }))
                    }
                    aria-label="משקל אמינות"
                    title="משקל אמינות 1-10 — משפיע על הדירוג"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>
                        משקל {w}
                      </option>
                    ))}
                  </select>
                  <Button onClick={addSource} disabled={addingSource} className="gap-1.5">
                    {addingSource ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    הוסף
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  המקור ייסרק אוטומטית בסריקה הבאה. המשקל (1–10) קובע כמה הדירוג סומך עליו.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">יומן ריצות</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-muted-foreground text-sm">אין ריצות עדיין.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="flex items-start gap-3 p-3 border rounded-lg text-sm">
                  <Badge variant="outline" className="shrink-0">
                    {run.kind === "scan" ? "סריקה" : "כתיבה"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p>
                      {run.kind === "scan"
                        ? `${run.items_new} חדשות · ${run.items_queued} נבחרו · ${run.sources_ok} מקורות תקינים${run.sources_failed ? `, ${run.sources_failed} נכשלו` : ""}`
                        : `${run.articles_created} טיוטות נוצרו`}
                    </p>
                    {(run.notes?.length ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{run.notes.join(" · ")}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {relativeTime(run.created_at)}
                    {run.duration_ms ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGlobalIngestTab;
