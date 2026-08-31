import { useState } from "react";
import { Article } from "@/hooks/useArticles";
import { generateWhatsappPost } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WhatsAppPostGeneratorProps {
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PUBLISHED_BASE_URL = "https://agendax.co.il";

const WhatsAppPostGenerator = ({ article, open, onOpenChange }: WhatsAppPostGeneratorProps) => {
  const generateWhatsappPostFn = generateWhatsappPost;
  const [generatedPost, setGeneratedPost] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WhatsApp linkifies a raw Hebrew URL and shows it as written; escaping it
  // turns the address into unreadable %-noise in the message body.
  const articleUrl = article ? `${PUBLISHED_BASE_URL}/article/${article.slug || article.id}` : "";

  const handleGenerate = async () => {
    if (!article) return;
    setIsGenerating(true);
    setGeneratedPost("");
    setError(null);

    try {
      const data = await generateWhatsappPostFn({
        data: {
          title: article.title,
          excerpt: article.excerpt,
          category: article.category,
          url: articleUrl,
          content: article.content,
        },
      });
      const post = (data.post || "").trim();
      // An empty answer used to reset the dialog to its opening state, which
      // read as the button simply not working. Say what happened instead.
      if (!post) throw new Error("לא התקבלה הודעה מהמודל");
      setGeneratedPost(post);
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה בלתי צפויה";
      console.error("Error generating whatsapp post:", e);
      setError(message);
      toast.error(`יצירת ההודעה נכשלה: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPost);
      setCopied(true);
      toast.success("ההודעה הועתקה!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("שגיאה בהעתקה");
    }
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(generatedPost);
    window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setGeneratedPost(""); setCopied(false); setError(null); } }}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
            יצירת הודעה לערוץ וואטסאפ
          </DialogTitle>
          <DialogDescription>
            {article?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!generatedPost && !isGenerating && (
            <>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  {error}
                </p>
              )}
              <Button onClick={handleGenerate} className="w-full gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white">
                <MessageCircle className="w-4 h-4" />
                {error ? "נסה שוב" : "צור הודעה לוואטסאפ"}
              </Button>
            </>
          )}

          {isGenerating && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>יוצר הודעה...</span>
            </div>
          )}

          {generatedPost && (
            <>
              <Textarea
                value={generatedPost}
                onChange={(e) => setGeneratedPost(e.target.value)}
                className="min-h-[180px] text-sm leading-relaxed"
                dir="rtl"
              />
              <div className="flex flex-col gap-2">
                <Button onClick={handleOpenWhatsApp} className="gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white">
                  <ExternalLink className="w-4 h-4" />
                  פתח בוואטסאפ
                </Button>
                <div className="flex gap-2">
                  <Button onClick={handleCopy} variant="outline" className="gap-2 flex-1">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? "הועתק!" : "העתק"}
                  </Button>
                  <Button onClick={handleGenerate} variant="secondary" className="gap-2 flex-1" disabled={isGenerating}>
                    <Loader2 className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                    צור מחדש
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppPostGenerator;
