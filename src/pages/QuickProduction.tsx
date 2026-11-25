// "הפקה מהירה": a hot story, from a typed headline to the site and the social
// networks, on one phone-sized page.
//
// The page is deliberately separate from the admin panel and loads none of its
// lists: it has to open fast when something has just happened.
//
// The flow never publishes on its own. The draft, the sources it was written
// from, the ten quality checks and every teaser are on screen first, and one
// button, pressed by an admin, is the only way anything reaches the site.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Undo2,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import {
  auditQuick,
  countWords,
  isQuickMock,
  loadQuickApi,
  storyAgeHours,
  type QuickApi,
  type QuickDraft,
  type QuickNetwork,
  type QuickPublishResult,
  type QuickRecent,
  type QuickStatus,
  type QuickTeasers,
  type QuickUnsupported,
} from "@/lib/quick.functions";

const NETWORK_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

const ORIGIN_LABEL: Record<string, string> = {
  pasted: "קישור שהודבק",
  google_news: "Google News",
  bing_news: "Bing News",
  buffer: "הסורק שלנו",
};

const STATUS_LABEL: Record<string, string> = {
  drafting: "בהכנה",
  ready: "טיוטה מוכנה",
  publishing: "בפרסום",
  published: "פורסמה",
  unpublished: "הפרסום בוטל",
  failed: "נכשלה",
  expired: "פג תוקף",
};

/** DD/MM/YYYY HH:MM, Israel time. */
function israelTime(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function ageLabel(hours: number): string {
  if (hours < 1) return `לפני ${Math.max(1, Math.round(hours * 60))} דקות`;
  const rounded = Math.round(hours);
  if (rounded === 1) return "לפני שעה";
  if (rounded === 2) return "לפני שעתיים";
  return `לפני ${rounded} שעות`;
}

/** One string for "this exact title, excerpt and body", as the server fingerprints it. */
const textKey = (title: string, excerpt: string, content: string): string =>
  [title.trim(), excerpt.trim(), content].join("\n\u0000\n");

/** The later of two opaque `updated_at` strings; same format, so text order is time order. */
const later = (a: string, b: string | null | undefined): string =>
  b && b > a ? b : a;

/**
 * Wraps each sentence the reviewer could not back in a highlight. A sentence
 * that runs across inline tags is not found this way; it still appears in the
 * list under the article, so nothing is lost, only the in-place marking.
 */
function markUnsupported(html: string, list: QuickUnsupported[]): string {
  let out = html;
  for (const { sentence } of list) {
    const s = sentence.trim();
    if (s.length < 12) continue;
    const at = out.indexOf(s);
    if (at === -1) continue;
    out =
      out.slice(0, at) +
      `<mark class="rounded bg-amber-300/90 px-0.5 text-black">${s}</mark>` +
      out.slice(at + s.length);
  }
  return out;
}

const DRAFT_STAGES = [
  { label: "חיפוש: מי מדווח על זה", at: 0 },
  { label: "קריאת המקורות במלואם", at: 8_000 },
  { label: "כתיבת הכתבה מהמקורות בלבד", at: 20_000 },
];

function DraftProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, []);
  const active = DRAFT_STAGES.reduce(
    (acc, s, i) => (elapsed >= s.at ? i : acc),
    0,
  );
  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-card p-5"
      role="status"
      aria-live="polite"
    >
      {DRAFT_STAGES.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-3 text-sm">
          {i < active ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : i === active ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          )}
          <span
            className={
              i === active
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {stage.label}
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">
        בדרך כלל עד דקה וחצי. הכתבה נשמרת כטיוטה, לא מתפרסמת.
      </p>
    </div>
  );
}

/**
 * The article body, edited in place: the editor fixes a sentence where it
 * stands, without meeting a tag. The HTML is written once, on mount, because
 * a re-render under the caret would throw it back to the start of the text.
 */
function EditableBody({
  html,
  onChange,
}: {
  html: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = useRef(html);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial.current;
  }, []);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="גוף הכתבה"
      className="article-content max-w-none min-w-0 overflow-x-hidden rounded-lg border border-input bg-background p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onInput={() => onChange(ref.current?.innerHTML ?? "")}
      onPaste={(e) => {
        // Plain text only: a paste must not bring another site's markup along.
        e.preventDefault();
        document.execCommand(
          "insertText",
          false,
          e.clipboardData.getData("text/plain"),
        );
      }}
    />
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "red" | "amber" | "blue";
  children: React.ReactNode;
}) {
  const tones = {
    red: "border-red-500/50 bg-red-500/15 text-red-100",
    amber: "border-amber-500/50 bg-amber-500/15 text-amber-100",
    blue: "border-primary/40 bg-primary/10 text-foreground",
  };
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm leading-relaxed",
        tones[tone],
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

type AuthState = "checking" | "admin" | "denied" | "error";
type Phase = "input" | "drafting" | "draft" | "published";

export default function QuickProduction() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthState>("checking");
  const [mock, setMock] = useState(false);
  const [api, setApi] = useState<QuickApi | null>(null);

  const [phase, setPhase] = useState<Phase>("input");
  const [headline, setHeadline] = useState("");
  const [links, setLinks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<QuickRecent[] | null>(null);

  const [draft, setDraft] = useState<QuickDraft | null>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<QuickUnsupported[]>([]);
  const [single, setSingle] = useState<{ flag: boolean; note: string | null }>({
    flag: false,
    note: null,
  });
  const [teasers, setTeasers] = useState<QuickTeasers>({});
  const [chosen, setChosen] = useState<Record<QuickNetwork, boolean>>({
    facebook: true,
    instagram: true,
    linkedin: true,
  });
  const [busy, setBusy] = useState({
    review: false,
    teasers: false,
    image: false,
    publish: false,
    undo: false,
  });
  const [stepError, setStepError] = useState<{
    review?: string;
    teasers?: string;
    image?: string;
  }>({});
  const [view, setView] = useState<"preview" | "edit">("preview");
  const [rawHtml, setRawHtml] = useState(false);
  const [pastedImage, setPastedImage] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [ack, setAck] = useState(false);
  const [ackUnsupported, setAckUnsupported] = useState(false);
  /** The exact text the editor's review scored; an edit after it needs a new review. */
  const [reviewedText, setReviewedText] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [copied, setCopied] = useState(false);

  const [published, setPublished] = useState<QuickPublishResult | null>(null);
  /** Networks that were ticked but held back before the request was sent. */
  const [heldBack, setHeldBack] = useState<
    { platform: string; reason: string }[]
  >([]);
  const [status, setStatus] = useState<QuickStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Access: a logged-in admin. The server checks again on every call. ----
  useEffect(() => {
    let cancelled = false;
    const isMock = isQuickMock();
    setMock(isMock);
    void loadQuickApi().then((loaded) => {
      if (!cancelled) setApi(loaded);
    });
    if (isMock) {
      setAuth("admin");
      return () => {
        cancelled = true;
      };
    }
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) {
        navigate("/auth?redirect=/quick", { replace: true });
        return;
      }
      const { data, error: roleError } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (cancelled) return;
      // A failed check is not a "no": the database may simply be busy. Unlike
      // the panel, nobody is signed out over it.
      if (roleError) setAuth("error");
      else setAuth(data === true ? "admin" : "denied");
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const adopt = useCallback((next: QuickDraft) => {
    setDraft(next);
    const article = next.article;
    setTitle(article?.title ?? "");
    setExcerpt(article?.excerpt ?? "");
    setContent(article?.content ?? "");
    setImageUrl(article?.imageUrl ?? "");
    setUpdatedAt(article?.updatedAt ?? "");
    setReviewScore(article?.reviewScore ?? null);
    setReviewedText(
      article && article.reviewScore != null
        ? textKey(article.title, article.excerpt, article.content)
        : null,
    );
    setBreaking(article?.isBreaking ?? false);
    setIssues([]);
    setUnsupported(next.unsupported ?? []);
    setSingle({ flag: next.singleSource, note: next.singleSourceNote });
    setTeasers(next.teasers ?? {});
    setAck(false);
    setAckUnsupported(false);
    setConfirming(false);
    setStepError({});
    setView("preview");
  }, []);

  const runReview = useCallback(
    async (target: {
      productionId: string;
      title: string;
      excerpt: string;
      content: string;
    }) => {
      if (!api) return;
      setBusy((b) => ({ ...b, review: true }));
      setStepError((e) => ({ ...e, review: undefined }));
      try {
        const result = await api.review(target);
        setReviewScore(result.reviewScore);
        setReviewedText(textKey(target.title, target.excerpt, target.content));
        setIssues(result.issues);
        setUnsupported(result.unsupported);
        // A new verdict is a new list: an earlier "I saw it" does not cover it.
        setAckUnsupported(false);
        setSingle({ flag: result.singleSource, note: result.singleSourceNote });
        setUpdatedAt((cur) => later(cur, result.articleUpdatedAt));
      } catch (e) {
        setStepError((s) => ({
          ...s,
          review: e instanceof Error ? e.message : "הבדיקה נכשלה",
        }));
      } finally {
        setBusy((b) => ({ ...b, review: false }));
      }
    },
    [api],
  );

  const runTeasers = useCallback(
    async (target: {
      productionId: string;
      title: string;
      excerpt: string;
      content: string;
    }) => {
      if (!api) return;
      setBusy((b) => ({ ...b, teasers: true }));
      setStepError((e) => ({ ...e, teasers: undefined }));
      try {
        const result = await api.teasers(target);
        setTeasers(result.teasers);
        if (result.failed.length) {
          setStepError((s) => ({
            ...s,
            teasers: `לא נכתב טקסט ל: ${result.failed.map((f) => NETWORK_LABEL[f] ?? f).join(", ")}`,
          }));
        }
      } catch (e) {
        setStepError((s) => ({
          ...s,
          teasers: e instanceof Error ? e.message : "כתיבת הפוסטים נכשלה",
        }));
      } finally {
        setBusy((b) => ({ ...b, teasers: false }));
      }
    },
    [api],
  );

  const runImage = useCallback(
    async (productionId: string, fromUrl?: string) => {
      if (!api) return;
      setBusy((b) => ({ ...b, image: true }));
      setStepError((e) => ({ ...e, image: undefined }));
      try {
        const result = await api.image({ productionId, imageUrl: fromUrl });
        setImageUrl(result.imageUrl);
        setUpdatedAt((cur) => later(cur, result.articleUpdatedAt));
        setPastedImage("");
      } catch (e) {
        setStepError((s) => ({
          ...s,
          image: e instanceof Error ? e.message : "התמונה נכשלה",
        }));
      } finally {
        setBusy((b) => ({ ...b, image: false }));
      }
    },
    [api],
  );

  /** Whatever a loaded draft is still missing is produced now, in parallel. */
  const fillIn = useCallback(
    (next: QuickDraft) => {
      const article = next.article;
      if (!article || next.status !== "ready") return;
      const target = {
        productionId: next.productionId,
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
      };
      if (article.reviewScore == null) void runReview(target);
      if (!next.teasers || Object.keys(next.teasers).length === 0)
        void runTeasers(target);
      const stock = next.context.limits.stockImage.split("?")[0];
      if (!article.imageUrl || article.imageUrl.split("?")[0] === stock)
        void runImage(next.productionId);
    },
    [runImage, runReview, runTeasers],
  );

  const pollStatus = useCallback(
    (productionId: string, attempt = 0) => {
      if (!api) return;
      if (pollRef.current) clearTimeout(pollRef.current);
      void api
        .status(productionId)
        .then((next) => {
          setStatus(next);
          // Three networks take up to a minute; past three minutes the row is
          // the 5-minute sweep's, and the editor can refresh by hand.
          if (!next.done && attempt < 60)
            pollRef.current = setTimeout(
              () => pollStatus(productionId, attempt + 1),
              3000,
            );
        })
        .catch(() => {
          if (attempt < 60)
            pollRef.current = setTimeout(
              () => pollStatus(productionId, attempt + 1),
              5000,
            );
        });
    },
    [api],
  );

  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

  const openProduction = useCallback(
    async (productionId: string) => {
      if (!api) return;
      setError(null);
      setPhase("drafting");
      try {
        const loaded = await api.get(productionId);
        adopt(loaded);
        if (loaded.status === "published" || loaded.status === "unpublished") {
          setPublished(null);
          setPhase("published");
          pollStatus(productionId);
        } else if (loaded.article) {
          setPhase("draft");
          fillIn(loaded);
        } else {
          setError(loaded.error || "להפקה הזאת אין טיוטה");
          setPhase("input");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "טעינת ההפקה נכשלה");
        setPhase("input");
      }
    },
    [adopt, api, fillIn, pollStatus],
  );

  // A link from an alert opens straight on its draft: /quick?id=<production>.
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (!api || auth !== "admin" || openedFromUrl.current) return;
    openedFromUrl.current = true;
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) void openProduction(id);
  }, [api, auth, openProduction]);

  const parsedLinks = useMemo(
    () =>
      links
        .split(/[\s,]+/)
        .map((l) => l.trim())
        .filter((l) => /^https?:\/\/\S+$/i.test(l))
        .slice(0, 6),
    [links],
  );

  const startDraft = async () => {
    if (!api) return;
    setError(null);
    setPhase("drafting");
    setPublished(null);
    setStatus(null);
    try {
      const next = await api.draft({
        title: headline.trim(),
        sourceUrls: parsedLinks,
      });
      adopt(next);
      setChosen({ facebook: true, instagram: true, linkedin: true });
      setPhase("draft");
      fillIn(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "הכנת הטיוטה נכשלה");
      setPhase("input");
    }
  };

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setDraft(null);
    setPublished(null);
    setHeldBack([]);
    setStatus(null);
    setHeadline("");
    setLinks("");
    setError(null);
    setConfirmUndo(false);
    setPhase("input");
  };

  // --- Derived state ----------------------------------------------------------
  const context = draft?.context ?? null;
  const article = draft?.article ?? null;
  const checks = useMemo(
    () =>
      article && context
        ? auditQuick(
            {
              title,
              excerpt,
              content,
              slug: article.slug,
              imageUrl,
              sourceUrl: article.sourceUrl,
              reviewScore,
            },
            context.limits,
          )
        : [],
    [article, content, context, excerpt, imageUrl, reviewScore, title],
  );
  const failing = checks.filter((c) => !c.ok);
  const ageHours = storyAgeHours(article?.sourcePublishedAt ?? null);
  const tooOld = !!context && ageHours > context.maxStoryAgeHours;

  const networkBlock = (network: QuickNetwork): string | null => {
    if (!context) return null;
    if (tooOld)
      return `הידיעה בת ${Math.round(ageHours)} שעות, ישנה מדי לרשתות (עד ${context.maxStoryAgeHours})`;
    if (network === "linkedin" && context.linkedin.full) {
      return `התקרה היומית מלאה (${context.linkedin.postedToday}/${context.linkedin.cap}). לא יעלה היום.`;
    }
    return null;
  };

  const going: QuickNetwork[] = context
    ? context.enabledPlatforms.filter((n) => chosen[n] && !networkBlock(n))
    : [];
  const missingText = going.filter((n) => !(teasers[n] ?? "").trim());
  const working = busy.review || busy.teasers || busy.image;
  const blockers: string[] = [];
  if (failing.length === 1)
    blockers.push(`בדיקת איכות אחת עוד אדומה: ${failing[0].label}`);
  else if (failing.length > 1)
    blockers.push(`${failing.length} בדיקות איכות עוד אדומות`);
  if (working)
    blockers.push(
      "עוד מכין: " +
        [
          busy.review && "ביקורת",
          busy.teasers && "פוסטים",
          busy.image && "תמונה",
        ]
          .filter(Boolean)
          .join(", "),
    );
  if (missingText.length)
    blockers.push(
      `חסר טקסט ל-${missingText.map((n) => NETWORK_LABEL[n]).join(", ")}`,
    );
  const editedSinceReview =
    reviewScore != null &&
    !busy.review &&
    reviewedText !== textKey(title, excerpt, content);
  if (editedSinceReview)
    blockers.push('הטקסט שונה מאז ביקורת העורך: לחצו "בדוק שוב"');
  if (single.flag && !ack) blockers.push("מקור יחיד: צריך לסמן שראית");
  if (unsupported.length > 0 && !ackUnsupported)
    blockers.push("משפטים בלי גיבוי: צריך לסמן שראית");
  const canPublish = blockers.length === 0 && !busy.publish && !!article;
  const destination = going.length
    ? `האתר + ${going.map((n) => NETWORK_LABEL[n]).join(", ")}`
    : "האתר בלבד";

  const currentText = () => ({
    productionId: draft!.productionId,
    title: title.trim(),
    excerpt: excerpt.trim(),
    content,
  });

  const publish = async () => {
    if (!api || !draft || !canPublish) return;
    setBusy((b) => ({ ...b, publish: true }));
    setError(null);
    const held = (context?.enabledPlatforms ?? [])
      .filter((n) => chosen[n] && networkBlock(n))
      .map((n) => ({ platform: n as string, reason: networkBlock(n)! }));
    try {
      const result = await api.publish({
        ...currentText(),
        expectedUpdatedAt: updatedAt,
        isBreaking: breaking,
        platforms: going,
        teasers: Object.fromEntries(going.map((n) => [n, teasers[n] ?? ""])),
        acknowledgeSingleSource: ack,
        acknowledgeUnsupported: ackUnsupported,
      });
      setPublished(result);
      setHeldBack(held);
      setPhase("published");
      pollStatus(draft.productionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "הפרסום נכשל");
    } finally {
      setBusy((b) => ({ ...b, publish: false }));
      setConfirming(false);
    }
  };

  const unpublish = async () => {
    if (!api || !draft) return;
    setBusy((b) => ({ ...b, undo: true }));
    setError(null);
    try {
      await api.unpublish(draft.productionId);
      setConfirmUndo(false);
      pollStatus(draft.productionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ביטול הפרסום נכשל");
    } finally {
      setBusy((b) => ({ ...b, undo: false }));
    }
  };

  const retry = async () => {
    if (!api || !draft) return;
    setError(null);
    try {
      await api.retrySocial(draft.productionId);
      pollStatus(draft.productionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "הניסיון החוזר נכשל");
    }
  };

  const copyWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(teasers.whatsapp ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // --- Gates ------------------------------------------------------------------
  if (auth !== "admin") {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
      >
        {auth === "checking" && (
          <Loader2
            className="h-6 w-6 animate-spin text-primary"
            aria-label="טוען"
          />
        )}
        {auth === "denied" && (
          <div className="max-w-sm space-y-3 text-center">
            <p className="font-bold">הדף הזה למנהלי המערכת בלבד.</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              לאתר
            </Button>
          </div>
        )}
        {auth === "error" && (
          <div className="max-w-sm space-y-3 text-center">
            <p className="font-bold">לא הצלחנו לאמת הרשאה כרגע.</p>
            <p className="text-sm text-muted-foreground">
              ייתכן שמסד הנתונים עמוס. נסו שוב בעוד דקה.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              נסו שוב
            </Button>
          </div>
        )}
      </main>
    );
  }

  const liveUrl = status?.url ?? published?.url ?? null;
  const isLive = status ? status.live : !!published;
  const failedNetworks = (status?.networks ?? []).filter(
    (n) => n.state === "failed",
  );
  const postedNetworks = (status?.networks ?? []).filter(
    (n) => n.state === "posted",
  );
  // The server's list first; the page's own only for a network the server never saw.
  const notSent = [
    ...(published?.skipped ?? []),
    ...heldBack.filter(
      (h) => !(published?.skipped ?? []).some((s) => s.platform === h.platform),
    ),
  ];

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-background pb-40 text-foreground"
    >
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="flex items-center gap-2 text-lg font-black">
            <Zap className="h-5 w-5 text-primary" />
            הפקה מהירה
          </h1>
          <div className="flex items-center gap-1">
            {phase !== "input" && phase !== "drafting" && (
              <Button variant="ghost" size="sm" onClick={reset}>
                ידיעה חדשה
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
            >
              <ArrowRight className="ml-1 h-4 w-4" />
              לפאנל
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {mock && (
          <Banner tone="blue">
            <strong>מצב דמה.</strong> שום דבר לא נשמר, לא נשלח למודל ולא מתפרסם.
            כל הנתונים מומצאים.
          </Banner>
        )}
        {error && (
          <Banner tone="red">
            <span className="break-words">{error}</span>
          </Banner>
        )}

        {/* ---------------- 1. Headline ---------------- */}
        {phase === "input" && (
          <>
            <Section title="מה קרה?">
              <div className="space-y-2">
                <Label htmlFor="quick-headline">כותרת הידיעה</Label>
                <Input
                  id="quick-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="מה קרה, ולמי. למשל: חברה X רוכשת את חברה Y"
                  className="h-12 text-base"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (headline.trim().length >= 5 || parsedLinks.length > 0)
                    )
                      void startDraft();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-links">
                  קישורים למקורות{" "}
                  <span className="font-normal text-muted-foreground">
                    (רשות, עד 6, כתובת בכל שורה)
                  </span>
                </Label>
                <Textarea
                  id="quick-links"
                  dir="ltr"
                  rows={3}
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  placeholder="https://..."
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {parsedLinks.length > 0
                    ? `${parsedLinks.length} קישורים ייקראו ראשונים וישמשו כחומר המרכזי.`
                    : "קישור שתדביקו נקרא ראשון. בלי קישורים, המערכת מחפשת לבד דיווחים מ-48 השעות האחרונות, ואם אין, משבוע אחורה."}
                </p>
              </div>
              <Button
                className="h-12 w-full text-base font-bold"
                disabled={
                  !api ||
                  (headline.trim().length < 5 && parsedLinks.length === 0)
                }
                onClick={() => void startDraft()}
              >
                <Zap className="ml-2 h-5 w-5" />
                הכן טיוטה
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                הכתבה נכתבת רק מעובדות שמופיעות במקורות שנקראו, ונשמרת כטיוטה.
                שום דבר לא עולה לאתר או לרשתות בלי לחיצה שלך על "אשר ופרסם".
              </p>
            </Section>

            <div className="text-center">
              {recent === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!api}
                  onClick={() =>
                    void api
                      ?.recent()
                      .then(setRecent)
                      .catch(() => setRecent([]))
                  }
                >
                  הפקות אחרונות
                </Button>
              ) : recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  אין עדיין הפקות.
                </p>
              ) : (
                <ul className="space-y-2 text-right">
                  {recent.map((r) => (
                    <li key={r.productionId}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm hover:border-primary/60"
                        onClick={() => void openProduction(r.productionId)}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {r.requestedTitle}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {STATUS_LABEL[r.status] ?? r.status} ·{" "}
                          {israelTime(r.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {phase === "drafting" && <DraftProgress />}

        {/* ---------------- 2-5. The draft ---------------- */}
        {phase === "draft" && draft && article && context && (
          <>
            {single.flag && (
              <Banner tone="red">
                <strong>מקור יחיד.</strong>{" "}
                {single.note ?? "הכתבה נשענת על כלי תקשורת אחד."} המקור מיוחס
                בשמו בגוף הכתבה.
              </Banner>
            )}
            {(draft.existing?.length ?? 0) > 0 && (
              <Banner tone="amber">
                <strong>כבר יש באתר כתבה על אותו נושא:</strong>
                <ul className="mt-1 list-disc space-y-0.5 pr-4">
                  {draft.existing!.map((e) => (
                    <li key={e.slug}>
                      {e.title}{" "}
                      <span className="text-xs opacity-80">
                        ({israelTime(e.publishedAt)})
                      </span>
                    </li>
                  ))}
                </ul>
              </Banner>
            )}

            <Section
              title="מקורות"
              aside={
                <span className="text-xs text-muted-foreground">
                  {draft.outletsCount} כלי תקשורת · {draft.readCount} נקראו
                  במלואם
                </span>
              }
            >
              <ul className="divide-y divide-border">
                {draft.sources.map((s) => (
                  <li
                    key={`${s.domain}-${s.title}`}
                    className="flex items-start gap-3 py-2.5 text-sm"
                  >
                    {s.read ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                        aria-label="נקרא במלואו"
                      />
                    ) : (
                      <Circle
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60"
                        aria-label="לא נקרא"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-bold">{s.outlet}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.publishedAt
                            ? israelTime(s.publishedAt)
                            : "שעה לא ידועה"}{" "}
                          · {ORIGIN_LABEL[s.origin] ?? s.origin}
                        </span>
                      </div>
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-words text-primary underline-offset-2 hover:underline"
                        >
                          {s.title}
                          <ExternalLink className="mr-1 inline h-3 w-3" />
                        </a>
                      ) : (
                        <span className="block break-words text-foreground/85">
                          {s.title}
                        </span>
                      )}
                      <span
                        className={cn(
                          "text-xs",
                          !s.read
                            ? "text-muted-foreground"
                            : s.note
                              ? "text-amber-300"
                              : "text-emerald-400",
                        )}
                      >
                        {s.read
                          ? (s.note ?? "נקרא במלואו")
                          : (s.note ?? "לא נקרא")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                גיל הידיעה:{" "}
                {draft.ageUnknown
                  ? "לא ידוע (לאף מקור אין שעת פרסום)"
                  : ageLabel(ageHours)}
                . כותרת שלא נקראה היא עדות שהסיפור מדווח, לא מקור לעובדות.
              </p>
            </Section>

            <Section
              title="הכתבה"
              aside={
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={view === "preview" ? "default" : "outline"}
                    onClick={() => setView("preview")}
                  >
                    כמו באתר
                  </Button>
                  <Button
                    size="sm"
                    variant={view === "edit" ? "default" : "outline"}
                    onClick={() => setView("edit")}
                  >
                    עריכה
                  </Button>
                </div>
              }
            >
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                  <img
                    src={imageUrl}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                  {busy.image && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> מכין תמונה
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy.image}
                    onClick={() => void runImage(draft.productionId)}
                  >
                    <ImageIcon className="ml-1 h-4 w-4" />
                    תמונה אחרת
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    או כתובת של תמונה:
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    dir="ltr"
                    value={pastedImage}
                    onChange={(e) => setPastedImage(e.target.value)}
                    placeholder="https://"
                    className="h-9 min-w-0 flex-1 text-xs"
                    aria-label="כתובת תמונה להחלפה"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busy.image || !/^https:\/\/\S+$/i.test(pastedImage.trim())
                    }
                    onClick={() =>
                      void runImage(draft.productionId, pastedImage.trim())
                    }
                  >
                    החלף
                  </Button>
                </div>
                {stepError.image && (
                  <p className="text-xs text-red-300">{stepError.image}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  איור מופשט, בלי אנשים אמיתיים ובלי הדמיה של האירוע.
                </p>
              </div>

              {view === "preview" ? (
                <div className="min-w-0">
                  <h3 className="mb-2 text-2xl font-black leading-tight">
                    {title}
                  </h3>
                  <p className="mb-4 text-lg font-medium text-foreground/80">
                    {excerpt}
                  </p>
                  <div
                    className="article-content max-w-none min-w-0 overflow-x-hidden"
                    dangerouslySetInnerHTML={{
                      __html: markUnsupported(content, unsupported),
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-title">
                      כותרת{" "}
                      <span className="font-normal text-muted-foreground">
                        ({title.trim().length} תווים, {context.limits.titleMin}-
                        {context.limits.titleMax})
                      </span>
                    </Label>
                    <Input
                      id="quick-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-excerpt">
                      תקציר{" "}
                      <span className="font-normal text-muted-foreground">
                        ({excerpt.trim().length} תווים,{" "}
                        {context.limits.excerptMin}-{context.limits.excerptMax})
                      </span>
                    </Label>
                    <Textarea
                      id="quick-excerpt"
                      rows={3}
                      value={excerpt}
                      onChange={(e) => setExcerpt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="quick-content">
                        גוף הכתבה{" "}
                        <span className="font-normal text-muted-foreground">
                          ({countWords(content)} מילים, לפחות{" "}
                          {context.limits.bodyMinWords})
                        </span>
                      </Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRawHtml((v) => !v)}
                      >
                        {rawHtml ? "עריכה רגילה" : "HTML"}
                      </Button>
                    </div>
                    {rawHtml ? (
                      <Textarea
                        id="quick-content"
                        dir="ltr"
                        rows={16}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="font-mono text-xs leading-relaxed"
                      />
                    ) : (
                      <EditableBody html={content} onChange={setContent} />
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                חתימה: חדשות AgendaX · קטגוריה: {article.category}
              </p>

              {unsupported.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                  <p className="text-sm font-bold text-amber-100">
                    משפטים בלי גיבוי במקורות ({unsupported.length})
                  </p>
                  <ul className="space-y-2 text-sm">
                    {unsupported.map((u) => (
                      <li key={u.sentence}>
                        <mark className="rounded bg-amber-300/90 px-0.5 text-black">
                          {u.sentence}
                        </mark>
                        <span className="mt-0.5 block text-xs text-amber-100/90">
                          {u.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-100/90">
                    תקנו או מחקו ב"עריכה", ואז "בדוק שוב".
                  </p>
                </div>
              )}
              {draft.overlaps.length > 0 && (
                <div className="space-y-1 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">
                  <p className="font-bold text-red-100">
                    ניסוח שזהה למקור ({draft.overlaps.length})
                  </p>
                  <ul className="list-disc space-y-1 pr-4 text-red-100/90">
                    {draft.overlaps.map((o) => (
                      <li key={o.snippet}>
                        <span className="font-medium">{o.outlet}:</span>{" "}
                        {o.snippet}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-100/80">
                    אם זה לא ציטוט מסומן, נסחו מחדש לפני האישור.
                  </p>
                </div>
              )}
            </Section>

            <Section
              title="בדיקות איכות"
              aside={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy.review}
                  onClick={() => void runReview(currentText())}
                >
                  {busy.review ? (
                    <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="ml-1 h-4 w-4" />
                  )}
                  בדוק שוב
                </Button>
              }
            >
              <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {checks.map((c) => {
                  const pending =
                    (c.id === "editor_review" && busy.review) ||
                    (c.id === "own_image" && busy.image);
                  return (
                    <li key={c.id} className="flex items-start gap-2 text-sm">
                      {pending ? (
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : c.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      )}
                      <span
                        className={
                          c.ok ? "text-foreground/90" : "text-foreground"
                        }
                      >
                        {c.label}
                        {!c.ok && !pending && (
                          <span className="block text-xs text-red-300">
                            {c.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {stepError.review && (
                <p className="text-xs text-red-300">
                  ביקורת העורך נכשלה: {stepError.review}
                </p>
              )}
              {issues.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground/90">
                    הערות העורך:
                  </span>{" "}
                  {issues.join(" · ")}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                כתבה שלא עוברת את כל העשר לא מתפרסמת: אחרת שומר האיכות של האתר
                היה משכתב אותה אחרי האישור.
              </p>
            </Section>

            <Section
              title="רשתות"
              aside={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy.teasers}
                  onClick={() => void runTeasers(currentText())}
                >
                  {busy.teasers ? (
                    <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="ml-1 h-4 w-4" />
                  )}
                  כתוב מחדש
                </Button>
              }
            >
              {tooOld && (
                <Banner tone="amber">
                  הידיעה בת {Math.round(ageHours)} שעות. מעל{" "}
                  {context.maxStoryAgeHours} שעות היא עולה לאתר בלבד, בלי רשתות.
                </Banner>
              )}
              {stepError.teasers && (
                <p className="text-xs text-red-300">{stepError.teasers}</p>
              )}
              {context.enabledPlatforms.length === 0 && (
                <p className="text-sm text-muted-foreground">אין רשת מחוברת.</p>
              )}
              <div className="space-y-4">
                {context.enabledPlatforms.map((network) => {
                  const blocked = networkBlock(network);
                  const id = `quick-net-${network}`;
                  return (
                    <div key={network} className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={chosen[network] && !blocked}
                          disabled={!!blocked}
                          onCheckedChange={(v) =>
                            setChosen((c) => ({ ...c, [network]: v === true }))
                          }
                        />
                        <Label htmlFor={id} className="font-bold">
                          {NETWORK_LABEL[network]}
                        </Label>
                        {network === "linkedin" && !blocked && (
                          <span className="text-xs text-muted-foreground">
                            {context.linkedin.postedToday}/
                            {context.linkedin.cap} היום
                          </span>
                        )}
                        {blocked && (
                          <span className="text-xs text-amber-300">
                            {blocked}
                          </span>
                        )}
                      </div>
                      {busy.teasers && !teasers[network] ? (
                        <div className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> כותב
                        </div>
                      ) : (
                        <Textarea
                          rows={6}
                          value={teasers[network] ?? ""}
                          disabled={!!blocked || !chosen[network]}
                          onChange={(e) =>
                            setTeasers((t) => ({
                              ...t,
                              [network]: e.target.value,
                            }))
                          }
                          aria-label={`טקסט הפוסט ל-${NETWORK_LABEL[network]}`}
                          className="text-sm leading-relaxed"
                        />
                      )}
                      {network !== "linkedin" &&
                        context.dmAutomation &&
                        !blocked && (
                          <p className="text-xs text-muted-foreground">
                            תתווסף אוטומטית שורת "הגיבו X". היא נבחרת ברגע
                            הפרסום ולא מוצגת כאן.
                          </p>
                        )}
                      {network === "linkedin" &&
                        context.linkedinLinkInComment &&
                        !blocked && (
                          <p className="text-xs text-muted-foreground">
                            תתווסף השורה "הקישור לכתבה המלאה בתגובה הראשונה 👇",
                            והקישור עצמו עולה כתגובה.
                          </p>
                        )}
                    </div>
                  );
                })}
              </div>

              {teasers.whatsapp && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                      WhatsApp{" "}
                      <span className="font-normal text-muted-foreground">
                        (להעתקה ידנית)
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copyWhatsapp()}
                    >
                      {copied ? (
                        <Check className="ml-1 h-4 w-4" />
                      ) : (
                        <Copy className="ml-1 h-4 w-4" />
                      )}
                      {copied ? "הועתק" : "העתק"}
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    value={teasers.whatsapp}
                    onChange={(e) =>
                      setTeasers((t) => ({ ...t, whatsapp: e.target.value }))
                    }
                    aria-label="טקסט ל-WhatsApp"
                    className="text-sm"
                  />
                </div>
              )}
            </Section>

            {/* ---------------- 5. Approve ---------------- */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
              <div className="mx-auto max-w-3xl space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={breaking}
                      onCheckedChange={(v) => setBreaking(v === true)}
                    />
                    מבזק
                  </label>
                  {single.flag && (
                    <label className="flex items-center gap-2 text-red-200">
                      <Checkbox
                        checked={ack}
                        onCheckedChange={(v) => setAck(v === true)}
                      />
                      ראיתי: מקור יחיד
                    </label>
                  )}
                  {unsupported.length > 0 && (
                    <label className="flex items-center gap-2 text-amber-200">
                      <Checkbox
                        checked={ackUnsupported}
                        onCheckedChange={(v) => setAckUnsupported(v === true)}
                      />
                      ראיתי:{" "}
                      {unsupported.length === 1
                        ? "משפט אחד"
                        : `${unsupported.length} משפטים`}{" "}
                      בלי גיבוי
                    </label>
                  )}
                </div>
                {blockers.length > 0 ? (
                  <p className="text-xs text-amber-300">
                    {blockers.join(" · ")}
                  </p>
                ) : confirming ? (
                  <p className="text-xs font-bold text-foreground">
                    לחיצה נוספת מפרסמת ל: {destination}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    יעלה עכשיו: {destination}. ידיעה על אדם או חברה בהקשר שלילי:
                    לקרוא פעמיים.
                  </p>
                )}
                {/* The accessibility button is fixed to the bottom-left corner on
                    every page; on a narrow screen the row steps aside for it. */}
                {confirming ? (
                  <div className="flex gap-2 pl-[4.5rem] lg:pl-0">
                    <Button
                      className="h-12 min-w-0 flex-1 text-base font-bold"
                      disabled={busy.publish}
                      onClick={() => void publish()}
                    >
                      {busy.publish ? (
                        <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="ml-2 h-5 w-5" />
                      )}
                      כן, פרסם
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12"
                      disabled={busy.publish}
                      onClick={() => setConfirming(false)}
                    >
                      ביטול
                    </Button>
                  </div>
                ) : (
                  <div className="pl-[4.5rem] lg:pl-0">
                    <Button
                      className="h-12 w-full text-base font-bold"
                      disabled={!canPublish}
                      onClick={() => setConfirming(true)}
                    >
                      <Send className="ml-2 h-5 w-5" />
                      אשר ופרסם
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---------------- After publishing ---------------- */}
        {phase === "published" && draft && (
          <>
            <Section title={isLive ? "הכתבה באוויר" : "הפרסום בוטל"}>
              {isLive && liveUrl ? (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="block break-all rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary hover:underline"
                >
                  {decodeURIComponent(liveUrl)}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  הכתבה חזרה לטיוטה ונמצאת בפאנל, תחת "טיוטות".
                </p>
              )}
              {isLive && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  עלתה ב-
                  {israelTime(
                    status?.publishedAt ?? published?.publishedAt ?? null,
                  )}
                  . גולשים רואים אותה עכשיו. זחלנים, גוגל ותצוגות קישור יקבלו
                  404 עד ה-build הבא של האתר
                  {context
                    ? `, בסביבות ${israelTime(published?.nextBuildAt ?? context.nextBuildAt)}`
                    : ""}
                  .
                </p>
              )}
            </Section>

            <Section
              title="רשתות"
              aside={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => pollStatus(draft.productionId)}
                >
                  <RefreshCw className="ml-1 h-4 w-4" />
                  רענן
                </Button>
              }
            >
              {!status ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> בודק
                </div>
              ) : status.networks.length === 0 && notSent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  הכתבה עלתה לאתר בלבד.
                </p>
              ) : (
                <ul className="space-y-2">
                  {status.networks.map((n) => (
                    <li
                      key={n.platform}
                      className="flex items-start gap-2 text-sm"
                    >
                      {n.state === "posted" && (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                      {n.state === "waiting" && (
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                      )}
                      {n.state === "failed" && (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      )}
                      {n.state === "skipped" && (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="font-bold">
                          {NETWORK_LABEL[n.platform] ?? n.platform}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {n.state === "posted" && "עלה"}
                          {n.state === "waiting" && "בדרך"}
                          {n.state === "failed" && "נכשל"}
                          {n.state === "skipped" && "לא עלה"}
                        </span>
                        {n.link && (
                          <a
                            href={n.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mr-2 text-primary hover:underline"
                          >
                            לפוסט
                            <ExternalLink className="mr-1 inline h-3 w-3" />
                          </a>
                        )}
                        {n.note && (
                          <span className="block break-words text-xs text-muted-foreground">
                            {n.note}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  {notSent.map((s) => (
                    <li
                      key={`skipped-${s.platform}`}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <div>
                        <span className="font-bold">
                          {NETWORK_LABEL[s.platform] ?? s.platform}
                        </span>{" "}
                        <span className="text-muted-foreground">לא נשלח</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.reason}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!isLive && postedNetworks.length > 0 && (
                <Banner tone="amber">
                  הפוסטים שכבר עלו (
                  {postedNetworks
                    .map((n) => NETWORK_LABEL[n.platform] ?? n.platform)
                    .join(", ")}
                  ) עדיין באוויר. מחקו אותם ידנית ברשת עצמה.
                </Banner>
              )}
              {failedNetworks.length > 0 && isLive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retry()}
                >
                  <RefreshCw className="ml-1 h-4 w-4" />
                  נסה שוב:{" "}
                  {failedNetworks
                    .map((n) => NETWORK_LABEL[n.platform] ?? n.platform)
                    .join(", ")}
                </Button>
              )}
              {teasers.whatsapp && isLive && (
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                  <span>טקסט ל-WhatsApp, להדבקה ידנית</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copyWhatsapp()}
                  >
                    {copied ? (
                      <Check className="ml-1 h-4 w-4" />
                    ) : (
                      <Copy className="ml-1 h-4 w-4" />
                    )}
                    {copied ? "הועתק" : "העתק"}
                  </Button>
                </div>
              )}
            </Section>

            {isLive && (
              <Section title="טעות?">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  "בטל פרסום" מחזיר את הכתבה לטיוטה ועוצר פוסטים שעוד לא יצאו.
                  פוסטים שכבר עלו לא נמחקים: מוחקים אותם ידנית ברשת עצמה. דף
                  שכבר נבנה נעלם ב-build הבא.
                </p>
                {confirmUndo ? (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={busy.undo}
                      onClick={() => void unpublish()}
                    >
                      {busy.undo ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="ml-2 h-4 w-4" />
                      )}
                      כן, להוריד מהאתר
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy.undo}
                      onClick={() => setConfirmUndo(false)}
                    >
                      השאר
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmUndo(true)}
                  >
                    <Undo2 className="ml-2 h-4 w-4" />
                    בטל פרסום
                  </Button>
                )}
              </Section>
            )}

            <Button variant="outline" className="h-11 w-full" onClick={reset}>
              ידיעה חדשה
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
