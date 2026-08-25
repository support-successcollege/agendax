import { useState, useEffect } from "react";
import { generateArticle, verifyArticle } from "@/lib/ai.functions";
import { useCategories } from "@/hooks/useCategories";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Check, RefreshCw, Shield, AlertTriangle, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { Article } from "@/data/articles";
import { cn } from "@/lib/utils";
import QualityScoreIndicator from "./QualityScoreIndicator";

interface AIArticleGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArticleGenerated: (article: Article) => void;
}

interface GeneratedArticle {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  imageUrl?: string;
  /** Pasted links the server could not read (paywall, bot block). */
  unreadableUrls?: string[];
}

interface FactCheck {
  claim: string;
  status: "verified" | "unverified" | "false" | "needs_context";
  explanation: string;
}

interface VerificationResult {
  overallScore: number;
  isReliable: boolean;
  issues: string[];
  suggestions: string[];
  factChecks: FactCheck[];
  summary: string;
}

// The generation stages, advancing on a timer that mirrors each stage's real
// share of the wait. Purely presentational — the server does all three in one
// call — but "researching…" beats a bare spinner for a 40-second wait.
const GEN_STAGES = [
  { label: "מחקר — סריקת מקורות עדכניים", at: 0 },
  { label: "כתיבה — ניסוח הכתבה בעברית", at: 12_000 },
  { label: "תמונה — הפקת תמונת שער", at: 32_000 },
];

const GenerationProgress = () => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(t);
  }, []);
  const activeIndex = GEN_STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);
  return (
    <div className="space-y-3">
      {GEN_STAGES.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-3 text-sm">
          {i < activeIndex ? (
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : i === activeIndex ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          ) : (
            <span className="w-4 h-4 rounded-full border border-border shrink-0" />
          )}
          <span className={i === activeIndex ? "text-foreground font-medium" : "text-muted-foreground"}>
            {stage.label}
          </span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground pt-1">בדרך כלל 30-60 שניות. הכתבה תישמר כטיוטה.</p>
    </div>
  );
};

const AIArticleGenerator = ({ open, onOpenChange, onArticleGenerated }: AIArticleGeneratorProps) => {
  const { categories } = useCategories();
  const generateArticleFn = generateArticle;
  const verifyArticleFn = verifyArticle;
  const [topic, setTopic] = useState("");
  const [sourceLinks, setSourceLinks] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState<GeneratedArticle | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("preview");
  const { toast } = useToast();

  // One link per line; blank lines and stray text are dropped.
  const parsedLinks = sourceLinks
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\/\S+$/i.test(l))
    .slice(0, 6);

  const handleGenerate = async () => {
    if (!topic.trim() && parsedLinks.length === 0) {
      toast({
        title: "שגיאה",
        description: "יש להזין נושא לכתבה, קישורים למקורות, או שניהם",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedArticle(null);
    setVerificationResult(null);

    try {
      const data = await generateArticleFn({
        data: {
          topic: topic.trim() || undefined,
          sourceUrls: parsedLinks.length ? parsedLinks : undefined,
        },
      });

      setGeneratedArticle(data);
      const unread = data.unreadableUrls?.length ?? 0;
      toast({
        title: "הכתבה נוצרה בהצלחה",
        description: unread
          ? `${unread} קישורים לא נקראו (מנוי או חסימה) — הכתבה נכתבה מהשאר.`
          : "בדוק את הכתבה ואשר אם היא מתאימה, או הפעל בדיקת אמינות",
      });
    } catch (error) {
      console.error("Error generating article:", error);
      toast({
        title: "שגיאה ביצירת הכתבה",
        description: error instanceof Error ? error.message : "אירעה שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVerify = async () => {
    if (!generatedArticle) return;

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const data = await verifyArticleFn({
        data: {
          title: generatedArticle.title,
          content: generatedArticle.content,
        },
      });

      setVerificationResult(data);
      toast({
        title: "בדיקת האמינות הושלמה",
        description: `ציון אמינות: ${data.overallScore}/10`,
      });
    } catch (error) {
      console.error("Error verifying article:", error);
      toast({
        title: "שגיאה בבדיקת האמינות",
        description: error instanceof Error ? error.message : "אירעה שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleApprove = () => {
    if (!generatedArticle) return;

    // Resolve against the live categories table — a hardcoded map here survived
    // the rebrand once and produced articles whose slug matched no category
    // page. If the model's suggestion isn't a real category, fall back to the
    // first non-home category rather than inventing a slug.
    const live = categories.filter((c) => c.slug !== "home" && c.isActive);
    const match =
      live.find((c) => c.name.trim() === (generatedArticle.category || "").trim()) ??
      live[0];
    const category = match?.name ?? "הייטק";
    const categorySlug = match?.slug ?? "hightech";

    const newArticle: Article = {
      id: Date.now().toString(),
      title: generatedArticle.title,
      excerpt: generatedArticle.excerpt,
      content: generatedArticle.content,
      category: category,
      categorySlug: categorySlug,
      date: new Date().toISOString().split("T")[0],
      imageUrl: generatedArticle.imageUrl || "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800",
      author: "מחולל AI",
      // Always a draft: generated text goes to the drafts pile for an editor's
      // pass, never straight onto the site.
      isDraft: true,
    };

    onArticleGenerated(newArticle);
    handleClose();

    toast({
      title: "הכתבה נשמרה כטיוטה",
      description: 'נמצאת בטאב "כתבות" תחת "טיוטות" — ערכו ופרסמו כשמוכן',
    });
  };

  const handleClose = () => {
    setTopic("");
    setGeneratedArticle(null);
    setVerificationResult(null);
    onOpenChange(false);
  };

  const getStatusIcon = (status: FactCheck["status"]) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "false":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "unverified":
        return <HelpCircle className="w-4 h-4 text-yellow-500" />;
      case "needs_context":
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    }
  };

  const getStatusText = (status: FactCheck["status"]) => {
    switch (status) {
      case "verified":
        return "מאומת";
      case "false":
        return "שגוי";
      case "unverified":
        return "לא מאומת";
      case "needs_context":
        return "דורש הקשר";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-500";
    if (score >= 5) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            מחולל כתבות AI
          </DialogTitle>
          <DialogDescription>
            הזן נושא, הדבק קישורים לכתבות בנושא, או שניהם — המערכת תסרוק, תחקור ותנסח כתבה מקורית
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Topic Input */}
          <div className="space-y-2">
            <Label htmlFor="topic">נושא הכתבה <span className="text-muted-foreground font-normal">(אפשר להשאיר ריק אם הדבקת קישורים)</span></Label>
            <Input
              id="topic"
              placeholder="לדוגמה: השפעת הבינה המלאכותית על שוק העבודה בישראל"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
            />

            <Label htmlFor="sourceLinks" className="pt-2 block">
              קישורים למקורות <span className="text-muted-foreground font-normal">(אופציונלי, עד 6 — כתובת בכל שורה)</span>
            </Label>
            <Textarea
              id="sourceLinks"
              dir="ltr"
              rows={3}
              placeholder={"https://www.calcalist.co.il/...\nhttps://techcrunch.com/..."}
              value={sourceLinks}
              onChange={(e) => setSourceLinks(e.target.value)}
              disabled={isGenerating}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {parsedLinks.length > 0
                ? `${parsedLinks.length} קישורים יקראו במלואם וישמשו כחומר המרכזי לכתבה.`
                : "המערכת קוראת כל קישור במלואו וכותבת כתבה מקורית על בסיסו — בלי להעתיק ובלי לאזכר את המקור בגוף הכתבה."}
            </p>

            <div className="flex justify-end pt-1">
              <Button onClick={handleGenerate} disabled={isGenerating || (!topic.trim() && parsedLinks.length === 0)}>
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מייצר...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 ml-2" />
                    צור כתבה
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* What the wait actually is: research → writing → image. One server
              call does all three, so the stages advance on a timer that
              mirrors their real durations. */}
          {isGenerating && (
            <div className="rounded-lg border bg-muted/30 p-5">
              <GenerationProgress />
            </div>
          )}

          {/* Generated Article — edit and preview are two views of the same
              piece, and the preview renders exactly the classes the site does,
              so what the editor approves is what readers will see. */}
          {generatedArticle && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              {(generatedArticle.unreadableUrls?.length ?? 0) > 0 && (
                <div className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                  <p className="font-medium">קישורים שלא נקראו — הכתבה נכתבה בלעדיהם:</p>
                  <ul className="list-disc pr-4 space-y-0.5" dir="ltr">
                    {generatedArticle.unreadableUrls!.map((u) => (
                      <li key={u} className="truncate">{u}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={viewMode === "edit" ? "default" : "outline"}
                    onClick={() => setViewMode("edit")}
                  >
                    עריכה
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === "preview" ? "default" : "outline"}
                    onClick={() => setViewMode("preview")}
                  >
                    תצוגה כמו באתר
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={generatedArticle.category}
                    onChange={(e) =>
                      setGeneratedArticle({ ...generatedArticle, category: e.target.value })
                    }
                    aria-label="קטגוריה"
                  >
                    {categories
                      .filter((c) => c.slug !== "home" && c.isActive)
                      .map((c) => (
                        <option key={c.slug} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    {!categories.some((c) => c.name === generatedArticle.category) && (
                      <option value={generatedArticle.category}>{generatedArticle.category}</option>
                    )}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerify}
                    disabled={isVerifying}
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        בודק...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4 ml-2" />
                        בדוק אמינות
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Quality Score Indicator */}
              <QualityScoreIndicator content={generatedArticle.content} title={generatedArticle.title} excerpt={generatedArticle.excerpt} />

              {viewMode === "preview" ? (
                <div className="rounded-lg border bg-background p-5">
                  {generatedArticle.imageUrl && (
                    <img
                      src={generatedArticle.imageUrl}
                      alt=""
                      className="w-full aspect-video object-cover rounded-lg mb-4"
                    />
                  )}
                  <h2 className="text-2xl font-black text-foreground mb-2">{generatedArticle.title}</h2>
                  <p className="text-lg text-foreground/80 font-medium mb-5">{generatedArticle.excerpt}</p>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: generatedArticle.content }}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>כותרת</Label>
                    <Input
                      value={generatedArticle.title}
                      onChange={(e) =>
                        setGeneratedArticle({ ...generatedArticle, title: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>תקציר</Label>
                    <Textarea
                      value={generatedArticle.excerpt}
                      onChange={(e) =>
                        setGeneratedArticle({ ...generatedArticle, excerpt: e.target.value })
                      }
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>תוכן הכתבה</Label>
                    <Textarea
                      value={generatedArticle.content}
                      onChange={(e) =>
                        setGeneratedArticle({ ...generatedArticle, content: e.target.value })
                      }
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Verification Results */}
          {verificationResult && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  תוצאות בדיקת האמינות
                </h3>
                <div className="flex items-center gap-2">
                  <span className={cn("text-2xl font-bold", getScoreColor(verificationResult.overallScore))}>
                    {verificationResult.overallScore}/10
                  </span>
                  {verificationResult.isReliable ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                {verificationResult.summary}
              </p>

              {verificationResult.issues.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-red-500 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    בעיות שזוהו
                  </Label>
                  <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                    {verificationResult.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {verificationResult.suggestions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-blue-500 flex items-center gap-1">
                    <Sparkles className="w-4 h-4" />
                    המלצות לשיפור
                  </Label>
                  <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                    {verificationResult.suggestions.map((suggestion, idx) => (
                      <li key={idx}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {verificationResult.factChecks.length > 0 && (
                <div className="space-y-2">
                  <Label>בדיקות עובדתיות</Label>
                  <div className="space-y-2">
                    {verificationResult.factChecks.map((check, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 border rounded text-sm bg-background"
                      >
                        <div className="flex items-start gap-2">
                          {getStatusIcon(check.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{check.claim}</span>
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded",
                                check.status === "verified" && "bg-green-100 text-green-700",
                                check.status === "false" && "bg-red-100 text-red-700",
                                check.status === "unverified" && "bg-yellow-100 text-yellow-700",
                                check.status === "needs_context" && "bg-orange-100 text-orange-700",
                              )}>
                                {getStatusText(check.status)}
                              </span>
                            </div>
                            <p className="text-muted-foreground">{check.explanation}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            ביטול
          </Button>
          {generatedArticle && (
            <>
              <Button variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="w-4 h-4 ml-2" />
                צור מחדש
              </Button>
              <Button onClick={handleApprove}>
                <Check className="w-4 h-4 ml-2" />
                אשר והוסף
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIArticleGenerator;
