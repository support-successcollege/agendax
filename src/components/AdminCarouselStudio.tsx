import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge";
import type { Article } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, GalleryHorizontal, ImagePlus, Loader2, RefreshCw, Save, Send, Sparkles } from "lucide-react";

/**
 * Builds a carousel post for an article and sends it to the queue.
 *
 * The server does the work in stages (script, then an AI background per
 * slide, then one render per call), so this card is mostly a patient loop:
 * while the carousel is still generating it asks the server to take the next
 * step every few seconds, and shows each slide as it lands. Closing the panel
 * pauses the carousel; opening it again resumes it.
 */

type SlideKind = "cover" | "point" | "cta";

interface Slide {
  kind: SlideKind;
  title: string;
  body: string;
  prompt: string;
  hf_request_id: string | null;
  bg_pending?: boolean;
  bg_url: string | null;
  bg_source: "gemini" | "higgsfield" | "article" | null;
  bg_error: string | null;
  png_url: string | null;
  version: number;
}

interface Carousel {
  id: string;
  article_id: string;
  status: "generating" | "ready" | "failed";
  caption: string;
  slides: Slide[];
  error: string | null;
  created_at: string;
}

type Platform = "facebook" | "instagram";
const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "instagram", label: "אינסטגרם" },
  { key: "facebook", label: "פייסבוק" },
];

const TICK_MS = 3000;
/** A render worker that just finished can refuse once; only a streak is a real failure. */
const MAX_TICK_FAILURES = 6;

const KIND_LABEL: Record<SlideKind, string> = { cover: "שער", point: "נקודה", cta: "סיום" };

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const stageOf = (slide: Slide) =>
  slide.png_url ? null : slide.bg_url ? "מרנדר טקסט…" : slide.hf_request_id || slide.bg_pending ? "מייצר תמונה…" : "ממתין…";

const SOURCE_LABEL: Record<string, string> = { gemini: "Gemini", higgsfield: "Higgsfield", article: "תמונת הכתבה" };

interface Props {
  articles: Article[];
  enabledPlatforms: string[];
  /** The queue card refreshes when a carousel is scheduled. */
  onScheduled?: () => void;
}

const AdminCarouselStudio = ({ articles, enabledPlatforms, onScheduled }: Props) => {
  const { toast } = useToast();
  const published = useMemo(() => articles.filter((a) => !a.isDraft), [articles]);

  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState("");
  const [existing, setExisting] = useState<Carousel[]>([]);
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [drafts, setDrafts] = useState<{ title: string; body: string }[]>([]);
  const [caption, setCaption] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [providerMissing, setProviderMissing] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram", "facebook"]);
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [scheduling, setScheduling] = useState(false);

  const failures = useRef(0);
  const ticking = useRef(false);

  const matches = useMemo(() => {
    const q = query.trim();
    const list = q ? published.filter((a) => a.title.includes(q)) : published;
    return list.slice(0, 12);
  }, [published, query]);

  /** Adopts a server copy; the edit fields follow only when nothing is being typed over. */
  const adopt = useCallback((next: Carousel, resetDrafts: boolean) => {
    setCarousel(next);
    if (resetDrafts) {
      setDrafts(next.slides.map((s) => ({ title: s.title, body: s.body })));
      setCaption(next.caption);
    }
  }, []);

  // ---- existing carousels for the chosen article ----
  useEffect(() => {
    if (!articleId) {
      setExisting([]);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("social_carousels")
        .select("*")
        .eq("article_id", articleId)
        .order("created_at", { ascending: false })
        .limit(5);
      setExisting((data ?? []) as Carousel[]);
    })();
  }, [articleId, carousel?.id]);

  // ---- the generation loop ----
  useEffect(() => {
    if (!carousel || carousel.status !== "generating") return;
    failures.current = 0;
    const timer = setInterval(async () => {
      if (ticking.current) return;
      ticking.current = true;
      try {
        const { carousel: next } = await invokeEdge<{ carousel: Carousel }>("social-carousel", {
          action: "tick",
          id: carousel.id,
        });
        failures.current = 0;
        adopt(next, false);
      } catch (error) {
        failures.current += 1;
        if (failures.current >= MAX_TICK_FAILURES) {
          clearInterval(timer);
          toast({
            title: "יצירת הקרוסלה נעצרה",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      } finally {
        ticking.current = false;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [carousel?.id, carousel?.status, adopt, toast]);

  // ---- actions ----
  const create = async () => {
    if (!articleId) {
      toast({ title: "בחר כתבה", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { carousel: next, providerReady } = await invokeEdge<{
        carousel: Carousel;
        provider: "gemini" | "higgsfield";
        providerReady: boolean;
      }>("social-carousel", { action: "create", articleId });
      setProviderMissing(!providerReady);
      adopt(next, true);
      toast({ title: "התסריט מוכן", description: `${next.slides.length} שקפים — מייצר תמונות` });
    } catch (error) {
      toast({
        title: "יצירת הקרוסלה נכשלה",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const dirty = useMemo(() => {
    if (!carousel) return false;
    if (caption !== carousel.caption) return true;
    return carousel.slides.some((s, i) => drafts[i] && (drafts[i].title !== s.title || drafts[i].body !== s.body));
  }, [carousel, drafts, caption]);

  const save = async () => {
    if (!carousel) return;
    setSaving(true);
    try {
      const { carousel: next } = await invokeEdge<{ carousel: Carousel }>("social-carousel", {
        action: "update",
        id: carousel.id,
        caption,
        slides: drafts,
      });
      adopt(next, true);
      toast({ title: "נשמר", description: next.status === "generating" ? "השקפים שהשתנו מתרנדרים מחדש" : undefined });
    } catch (error) {
      toast({ title: "השמירה נכשלה", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (index: number) => {
    if (!carousel) return;
    setRegenIndex(index);
    try {
      const { carousel: next } = await invokeEdge<{ carousel: Carousel }>("social-carousel", {
        action: "regenerate",
        id: carousel.id,
        index,
      });
      adopt(next, false);
    } catch (error) {
      toast({ title: "יצירת רקע חדש נכשלה", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setRegenIndex(null);
    }
  };

  const schedule = async (now: boolean) => {
    if (!carousel) return;
    if (carousel.status !== "ready") {
      toast({ title: "הקרוסלה עדיין לא מוכנה", variant: "destructive" });
      return;
    }
    if (dirty) {
      toast({ title: "יש שינויים שלא נשמרו", description: "שמור לפני התזמון", variant: "destructive" });
      return;
    }
    if (platforms.length === 0) {
      toast({ title: "בחר לפחות רשת אחת", variant: "destructive" });
      return;
    }
    const at = now ? new Date() : new Date(when);
    if (Number.isNaN(at.getTime())) {
      toast({ title: "מועד לא תקין", variant: "destructive" });
      return;
    }
    setScheduling(true);
    try {
      const { data, error } = await (supabase as any)
        .from("social_queue")
        .insert({
          article_id: carousel.article_id,
          carousel_id: carousel.id,
          platforms,
          kind: "carousel",
          scheduled_at: at.toISOString(),
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;

      if (now) {
        const result = await invokeEdge<{ ok: boolean; error?: string; results?: { platform: string; ok: boolean; error?: string }[] }>(
          "social-publish",
          { queueId: data.id },
        );
        const failed = (result.results ?? []).filter((r) => !r.ok);
        toast({
          title: result.ok ? "הקרוסלה פורסמה" : "הפרסום נכשל",
          description: failed.length ? failed.map((f) => `${f.platform}: ${f.error}`).join(" · ") : undefined,
          variant: result.ok ? undefined : "destructive",
        });
      } else {
        toast({ title: "הקרוסלה תוזמנה", description: at.toLocaleString("he-IL") });
      }
      onScheduled?.();
    } catch (error) {
      toast({ title: "התזמון נכשל", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setScheduling(false);
    }
  };

  const rendered = carousel?.slides.filter((s) => s.png_url).length ?? 0;
  const total = carousel?.slides.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GalleryHorizontal className="w-5 h-5 text-primary" />
          סטודיו קרוסלות
        </CardTitle>
        <CardDescription>
          בחר כתבה — ה-AI כותב את השקפים, Gemini מייצר רקע לכל שקף, והטקסט מונח במיתוג של Agendax.
          אפשר לערוך כל שקף לפני התזמון.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---- article ---- */}
        <div className="space-y-2">
          <Input placeholder="חיפוש כתבה לפי כותרת…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {matches.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setArticleId(a.id);
                  setCarousel(null);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-right text-sm transition-colors ${
                  articleId === a.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <span className="flex-1 truncate">{a.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{a.category}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">לא נמצאו כתבות</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={create} disabled={!articleId || creating} className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {creating ? "כותב את השקפים…" : "צור קרוסלה"}
            </Button>
            {existing.length > 0 && (
              <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                קרוסלות קודמות:
                {existing.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => adopt(c, true)}
                    className={`rounded border px-2 py-0.5 ${carousel?.id === c.id ? "border-primary text-primary" : "border-border hover:border-primary/50"}`}
                  >
                    {new Date(c.created_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>

        {providerMissing && (
          <p className="rounded-md border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-600">
            מחולל התמונות לא מוגדר — הרקעים נלקחו מתמונת הכתבה.
          </p>
        )}

        {carousel && (
          <>
            {/* ---- status ---- */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {carousel.status === "generating" ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  בעבודה · {rendered}/{total} שקפים מוכנים
                </Badge>
              ) : carousel.status === "ready" ? (
                <Badge className="bg-emerald-600">מוכנה · {total} שקפים</Badge>
              ) : (
                <Badge variant="destructive">נכשלה</Badge>
              )}
              {carousel.error && <span className="text-destructive">{carousel.error}</span>}
            </div>

            {/* ---- slides ---- */}
            <div className="flex gap-4 overflow-x-auto pb-2" dir="rtl">
              {carousel.slides.map((slide, i) => {
                const stage = stageOf(slide);
                return (
                  <div key={i} className="w-[220px] shrink-0 space-y-2">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-border bg-muted">
                      {slide.png_url ? (
                        <img src={slide.png_url} alt={`שקף ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {stage}
                        </div>
                      )}
                      <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {i + 1} · {KIND_LABEL[slide.kind]}
                      </span>
                    </div>

                    <Input
                      value={drafts[i]?.title ?? ""}
                      onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      className="h-8 text-xs font-semibold"
                    />
                    <Textarea
                      rows={3}
                      value={drafts[i]?.body ?? ""}
                      onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                      className="text-xs"
                    />

                    <div className="flex items-center justify-between gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        disabled={regenIndex !== null || !slide.png_url}
                        onClick={() => regenerate(i)}
                      >
                        {regenIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                        רקע חדש
                      </Button>
                      <span className="text-[10px] text-muted-foreground">
                        {slide.bg_source ? SOURCE_LABEL[slide.bg_source] : ""}
                      </span>
                    </div>
                    {slide.bg_error && slide.bg_source === "article" && (
                      <p className="text-[10px] leading-snug text-amber-600">{slide.bg_error}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ---- caption ---- */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">כיתוב לפוסט (בפייסבוק יתווסף קישור לכתבה אוטומטית)</label>
              <Textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={save} disabled={!dirty || saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                שמור שינויים
              </Button>
              {dirty && <span className="text-xs text-amber-600">שינויים שלא נשמרו — השקפים יתרנדרו מחדש אחרי השמירה</span>}
            </div>

            {/* ---- publish ---- */}
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-4">
                {PLATFORMS.map((p) => {
                  const connected = enabledPlatforms.includes(p.key);
                  return (
                    <label key={p.key} className={`flex items-center gap-2 text-sm ${connected ? "" : "opacity-50"}`}>
                      <Checkbox
                        checked={platforms.includes(p.key)}
                        disabled={!connected}
                        onCheckedChange={(on) =>
                          setPlatforms((cur) => (on ? [...cur, p.key] : cur.filter((x) => x !== p.key)))
                        }
                      />
                      {p.label}
                      {!connected && <span className="text-[10px]">(לא מחובר)</span>}
                    </label>
                  );
                })}
              </div>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-auto" />
              <Button onClick={() => schedule(false)} disabled={scheduling || carousel.status !== "ready"} className="gap-2">
                {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                תזמן
              </Button>
              <Button
                variant="secondary"
                onClick={() => schedule(true)}
                disabled={scheduling || carousel.status !== "ready"}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                פרסם עכשיו
              </Button>
              {carousel.status !== "ready" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3" />
                  התזמון ייפתח כשכל השקפים יהיו מוכנים
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminCarouselStudio;
