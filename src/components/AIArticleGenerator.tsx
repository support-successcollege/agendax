import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateArticle, verifyArticle } from "@/lib/ai.functions";
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

const AIArticleGenerator = ({ open, onOpenChange, onArticleGenerated }: AIArticleGeneratorProps) => {
  const generateArticleFn = useServerFn(generateArticle);
  const verifyArticleFn = useServerFn(verifyArticle);
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState<GeneratedArticle | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({
        title: "שגיאה",
        description: "יש להזין נושא לכתבה",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedArticle(null);
    setVerificationResult(null);

    try {
      const data = await generateArticleFn({ data: { topic: topic.trim() } });

      setGeneratedArticle(data);
      toast({
        title: "הכתבה נוצרה בהצלחה",
        description: "בדוק את הכתבה ואשר אם היא מתאימה, או הפעל בדיקת אמינות",
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

    const categorySlugMap: Record<string, string> = {
      "חדשות": "news",
      "טכנולוגיה": "technology",
      "כלכלה": "economy",
      "פוליטיקה": "politics",
      "אקטואליה": "current",
      "שוק ההון": "stocks",
    };

    const category = generatedArticle.category || "חדשות";
    const categorySlug = categorySlugMap[category] || "news";

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
    };

    onArticleGenerated(newArticle);
    handleClose();
    
    toast({
      title: "הכתבה נוספה בהצלחה",
      description: "הכתבה נוספה לרשימת הכתבות",
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
            הזן נושא אקטואלי והמערכת תייצר עבורך כתבה מקצועית עם אפשרות לבדיקת אמינות
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Topic Input */}
          <div className="space-y-2">
            <Label htmlFor="topic">נושא הכתבה</Label>
            <div className="flex gap-2">
              <Input
                id="topic"
                placeholder="לדוגמה: השפעת הבינה המלאכותית על שוק העבודה בישראל"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
                className="flex-1"
              />
              <Button onClick={handleGenerate} disabled={isGenerating || !topic.trim()}>
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

          {/* Generated Article Preview */}
          {generatedArticle && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">תצוגה מקדימה</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    {generatedArticle.category}
                  </span>
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
