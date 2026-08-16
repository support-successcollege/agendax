import { useState } from "react";
import { Article } from "@/hooks/useArticles";
import { generateSocialPost } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SocialPostGeneratorProps {
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PUBLISHED_BASE_URL = "https://yznews.store";

const SocialPostGenerator = ({ article, open, onOpenChange }: SocialPostGeneratorProps) => {
  const generateSocialPostFn = generateSocialPost;
  const [generatedPost, setGeneratedPost] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const articleUrl = article ? `${PUBLISHED_BASE_URL}/article/${encodeURIComponent(article.slug || article.id)}` : "";

  const handleGenerate = async () => {
    if (!article) return;
    setIsGenerating(true);
    setGeneratedPost("");

    try {
      const data = await generateSocialPostFn({
        data: {
          title: article.title,
          excerpt: article.excerpt,
          category: article.category,
          url: articleUrl,
          content: article.content,
          imageUrl: article.imageUrl,
        },
      });
      setGeneratedPost(data.post || "");
    } catch (error) {
      console.error("Error generating social post:", error);
      toast.error("שגיאה ביצירת הפוסט, נסו שוב");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPost);
      setCopied(true);
      toast.success("הפוסט הועתק!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("שגיאה בהעתקה");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setGeneratedPost(""); setCopied(false); } }}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            יצירת פוסט לרשת חברתית
          </DialogTitle>
          <DialogDescription>
            {article?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!generatedPost && !isGenerating && (
            <Button onClick={handleGenerate} className="w-full gap-2">
              <Share2 className="w-4 h-4" />
              צור פוסט
            </Button>
          )}

          {isGenerating && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>יוצר פוסט...</span>
            </div>
          )}

          {generatedPost && (
            <>
              <Textarea
                value={generatedPost}
                onChange={(e) => setGeneratedPost(e.target.value)}
                className="min-h-[160px] text-sm leading-relaxed"
                dir="rtl"
              />
              <div className="flex gap-2">
                <Button onClick={handleCopy} variant="outline" className="gap-2 flex-1">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "הועתק!" : "העתק פוסט"}
                </Button>
                <Button onClick={handleGenerate} variant="secondary" className="gap-2 flex-1">
                  <Loader2 className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                  צור מחדש
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SocialPostGenerator;
