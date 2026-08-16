import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useImageUpload } from "@/hooks/useImageUpload";
import ArticleCreateDialog from "@/components/ArticleCreateDialog";
import { Article } from "@/hooks/useArticles";

// Allowed origins for postMessage from News Creator Plus
const ALLOWED_ORIGINS = [
  "https://id-preview--aea94b6f-be1c-49e5-97a5-02d2b7773f17.lovable.app",
  "https://aea94b6f-be1c-49e5-97a5-02d2b7773f17.lovable.app",
  "https://news-creator-plus.lovable.app",
];

// Default URL of the News Creator Plus app (preview URL — unpublished project)
const PLUS_URL = "https://id-preview--aea94b6f-be1c-49e5-97a5-02d2b7773f17.lovable.app";

interface AIArticlePlusBridgeProps {
  onSave: (article: Omit<Article, "id">) => Promise<void> | void;
  className?: string;
}

const plainTextToHtml = (text: string): string => {
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.trim().replace(/\n/g, "<br />")}</p>`)
    .filter(Boolean)
    .join("\n");
};

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
};

const AIArticlePlusBridge = ({ onSave, className }: AIArticlePlusBridgeProps) => {
  const { toast } = useToast();
  const { uploadImage } = useImageUpload();
  const popupRef = useRef<Window | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialArticle, setInitialArticle] = useState<Partial<Omit<Article, "id">> | undefined>();

  const openPlus = () => {
    const yzTarget = encodeURIComponent(window.location.origin);
    const url = `${PLUS_URL}/?yz_target=${yzTarget}`;
    popupRef.current = window.open(
      url,
      "yz_news_plus",
      "width=1200,height=900,noopener=no"
    );
    if (!popupRef.current) {
      toast({
        title: "החלון נחסם",
        description: "אנא אפשר חלונות קופצים עבור האתר כדי להשתמש במחולל המתקדם",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== "YZ_NEWS_ARTICLE") return;

      const { headline, article, bgDataUrl } = data as {
        headline?: string;
        article?: string;
        bgDataUrl?: string;
      };
      if (!headline || !article) return;

      setIsProcessing(true);
      try {
        let imageUrl = "";
        if (bgDataUrl) {
          try {
            const file = await dataUrlToFile(bgDataUrl, `plus-${Date.now()}.png`);
            const uploaded = await uploadImage(file);
            if (uploaded) imageUrl = uploaded;
          } catch (err) {
            console.error("Image upload from Plus failed:", err);
          }
        }

        const paragraphs = article.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        const excerpt = (paragraphs[0] ?? article).slice(0, 200);

        setInitialArticle({
          title: headline,
          excerpt,
          content: plainTextToHtml(article),
          imageUrl,
          author: "מחולל AI",
        });
        setDialogOpen(true);

        if (popupRef.current && !popupRef.current.closed) {
          try {
            popupRef.current.close();
          } catch {
            /* ignore */
          }
        }

        toast({
          title: "התוכן התקבל",
          description: "השלם את הקטגוריה ולחץ פרסם",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [toast, uploadImage]);

  const handleSave = async (article: Omit<Article, "id">) => {
    await onSave(article);
    setDialogOpen(false);
    setInitialArticle(undefined);
  };

  return (
    <>
      <Button
        type="button"
        onClick={openPlus}
        disabled={isProcessing}
        className={
          className ??
          "gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
        }
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Wand2 className="w-4 h-4" />
        )}
        מחולל מתקדם (Plus)
      </Button>

      <ArticleCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        initialArticle={initialArticle}
      />
    </>
  );
};

export default AIArticlePlusBridge;
