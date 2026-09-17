import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeEdge } from "@/lib/edge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ClipboardCheck, Loader2, Play, RefreshCw, Wand2 } from "lucide-react";

/**
 * The archive's quality, and the button that repairs it.
 *
 * Every criterion here is a yes/no an editor could check by hand, so "100%"
 * names something specific. The three that no machine can honestly fix —
 * a missing source, a body the source material cannot support, a sub-editor
 * score that stays low — are shown apart from the rest, because presenting an
 * unreachable 100% as the target would just train everyone to ignore the number.
 */

type Check = { id: string; label: string; ok: boolean; detail: string; needsRewrite: boolean };

type WorstRow = {
  id: string;
  title: string;
  quality_score: number;
  quality_issues: Check[];
};

type Stats = {
  total: number;
  unchecked: number;
  perfect: number;
  worst: WorstRow[];
};

type FixResult = {
  id: string;
  title: string;
  before: number;
  after: number;
  fixed: string[];
  skipped?: string[];
  error?: string;
};

/** Only an editor can supply these; the fixer reports them rather than faking them. */
const HUMAN_ONLY = new Set(["source_link"]);

const scoreTone = (score: number) =>
  score === 100 ? "bg-emerald-600" : score >= 80 ? "bg-amber-500" : "bg-destructive";

const AdminQualityCard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeEdge<Stats>("article-quality", { action: "stats" });
      setStats(data);
    } catch (error) {
      toast({
        title: "טעינת הציונים נכשלה",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const scan = async () => {
    setLoading(true);
    try {
      const data = await invokeEdge<{ scanned: number }>("article-quality", { action: "scan", limit: 400 });
      toast({ title: "הבדיקה הושלמה", description: `${data.scanned} כתבות נבדקו` });
      await load();
    } catch (error) {
      toast({ title: "הבדיקה נכשלה", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      setLoading(false);
    }
  };

  const report = (results: FixResult[]) => {
    const improved = results.filter((r) => !r.error && r.after > r.before);
    const stuck = results.filter((r) => r.error || r.after === r.before);
    toast({
      title: improved.length ? `${improved.length} כתבות שופרו` : "לא היה מה לתקן",
      description:
        improved.map((r) => `${r.before}% ← ${r.after}%`).join(" · ") +
        (stuck.length ? ` · ${stuck.length} נתקעו` : ""),
      variant: improved.length ? undefined : "destructive",
    });
  };

  const fixOne = async (id: string) => {
    setBusyId(id);
    try {
      const { result } = await invokeEdge<{ result: FixResult }>("article-quality", { action: "fix", articleId: id });
      report([result]);
      await load();
    } catch (error) {
      toast({ title: "התיקון נכשל", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  /**
    * One article per call, five times. A repair takes over a minute, so asking
    * the server for five at once would outlast the request; looping also lets
    * the list refresh as each one lands.
    */
  const sweep = async () => {
    setSweeping(true);
    const done: FixResult[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const data = await invokeEdge<{ handled: FixResult[]; remaining: number }>("article-quality", {
          action: "sweep",
          max: 1,
        });
        if (data.handled.length === 0) break;
        done.push(...data.handled);
        await load();
        if (data.remaining === 0) break;
      }
      report(done);
    } catch (error) {
      if (done.length) report(done);
      toast({ title: "הסבב נעצר", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSweeping(false);
    }
  };

  const checked = (stats?.total ?? 0) - (stats?.unchecked ?? 0);
  const perfectPct = checked > 0 ? Math.round(((stats?.perfect ?? 0) / checked) * 100) : 0;

  /** How often each criterion fails across the listed articles. */
  const breakdown = useMemo(() => {
    const counts = new Map<string, { label: string; n: number; human: boolean }>();
    for (const row of stats?.worst ?? []) {
      for (const check of row.quality_issues ?? []) {
        if (check.ok) continue;
        const entry = counts.get(check.id) ?? { label: check.label, n: 0, human: HUMAN_ONLY.has(check.id) };
        entry.n += 1;
        counts.set(check.id, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [stats]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          איכות הכתבות
        </CardTitle>
        <CardDescription>
          כל כתבה נבדקת מול עשרה קריטריונים מדידים — אורך כותרת ותקציר, אורך גוף, כותרות משנה,
          סקשן "למה זה חשוב לך", קישור פנימי, קישור מקור, תמונה משלה, כתובת קריאה וציון עורך.
          "תקן" מריץ שכתוב שמתקן רק את מה שנכשל, בלי להוסיף עובדות שאינן בכתבה.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={scoreTone(perfectPct)}>{perfectPct}% מהכתבות ב-100%</Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {stats?.perfect ?? 0} מתוך {checked} שנבדקו
          </span>
          {(stats?.unchecked ?? 0) > 0 && (
            <Badge variant="outline">{stats?.unchecked} לא נבדקו</Badge>
          )}
          <span className="flex-1" />
          <Button size="sm" variant="outline" className="gap-1.5" disabled={loading} onClick={scan}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            בדוק מחדש
          </Button>
          <Button size="sm" className="gap-1.5" disabled={sweeping || (stats?.worst.length ?? 0) === 0} onClick={sweep}>
            {sweeping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            תקן 5 הגרועות ברצף
          </Button>
        </div>

        {breakdown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {breakdown.map((b) => (
              <Badge key={b.label} variant="outline" className={b.human ? "border-muted-foreground/40 text-muted-foreground" : ""}>
                {b.label}: {b.n}
                {b.human && " (ידני)"}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {(stats?.worst ?? []).slice(0, 25).map((row) => {
            const broken = (row.quality_issues ?? []).filter((c) => !c.ok);
            const onlyHuman = broken.length > 0 && broken.every((c) => HUMAN_ONLY.has(c.id));
            return (
              <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5 text-sm">
                <Badge className={`${scoreTone(row.quality_score)} shrink-0 tabular-nums`}>{row.quality_score}%</Badge>
                <span className="min-w-[180px] flex-1 truncate font-medium" title={row.title}>{row.title}</span>
                <span className="flex flex-wrap gap-1">
                  {broken.map((c) => (
                    <span
                      key={c.id}
                      title={c.detail}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        HUMAN_ONLY.has(c.id) ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {c.label}
                    </span>
                  ))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={busyId === row.id || onlyHuman}
                  title={onlyHuman ? "רק עורך יכול להשלים את מה שחסר כאן" : undefined}
                  onClick={() => fixOne(row.id)}
                >
                  {busyId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  תקן
                </Button>
              </div>
            );
          })}

          {stats && stats.worst.length === 0 && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              כל הכתבות שנבדקו עומדות בכל הקריטריונים.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminQualityCard;
