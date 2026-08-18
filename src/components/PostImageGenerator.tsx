import { useCallback, useEffect, useRef, useState } from "react";
import { Article } from "@/hooks/useArticles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Download,
  Copy,
  Check,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PostImageGeneratorProps {
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The layout below recreates the "פוסט" brand template from the team's Canva
// account (design DAHSoWpkDsI, 1080×1350). Element positions, colors and
// opacities were taken from the template itself so the generated image matches
// what the template produces, without a Canva API round-trip.
const CANVA_TEMPLATE_EDIT_URL = "https://www.canva.com/d/DuoBy9GupNI-tYR";

const W = 1080;
const H = 1350;

const BRAND_BLUE = "#0d3c99";
const BRAND_CYAN = "#00d2fc";
const CREAM = "#fef7f2";
const DARK_R = 7;
const DARK_G = 14;
const DARK_B = 35;

const TITLE_MAX_WIDTH = 978;
const TITLE_TOP = 1024;
const TITLE_MAX_HEIGHT = H - TITLE_TOP - 36;
const TITLE_LINE_HEIGHT = 1.08;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });

/** Draw `img` into the given rect, scaled to cover it (like CSS object-fit: cover). */
const drawCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
};

const wrapLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
};

const renderPost = async (
  canvas: HTMLCanvasElement,
  title: string,
  imageUrl: string,
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  canvas.width = W;
  canvas.height = H;

  // Arimo (the site font, covers Hebrew + Latin) must be resolved before any
  // measureText/fillText call, otherwise the canvas falls back silently.
  await Promise.all([
    document.fonts.load("400 68px Arimo"),
    document.fonts.load("700 73px Arimo"),
  ]).catch(() => undefined);

  let photo: HTMLImageElement | null = null;
  if (imageUrl) {
    try {
      photo = await loadImage(imageUrl);
    } catch {
      photo = null;
    }
  }

  // 1. Page background (top strip stays visible above the photo).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // 2. Article photo — fills the canvas from y≈219 down, like the template's
  //    main media frame. Falls back to a brand gradient when the image can't
  //    be loaded (e.g. blocked by CORS).
  if (photo) {
    drawCover(ctx, photo, 0, 219, W, H - 219);
  } else {
    const fallback = ctx.createLinearGradient(0, 219, 0, H);
    fallback.addColorStop(0, BRAND_BLUE);
    fallback.addColorStop(1, `rgb(${DARK_R},${DARK_G},${DARK_B})`);
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 219, W, H - 219);
  }

  // 3. Dark overlay so the logo and headline stay readable.
  const overlay = ctx.createLinearGradient(0, 500, 0, H);
  overlay.addColorStop(0, `rgba(${DARK_R},${DARK_G},${DARK_B},0)`);
  overlay.addColorStop(0.45, `rgba(${DARK_R},${DARK_G},${DARK_B},0.62)`);
  overlay.addColorStop(1, `rgba(${DARK_R},${DARK_G},${DARK_B},0.94)`);
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 500, W, H - 500);

  // 4. Decorative waves along the top edge (blue under cream, both translucent).
  ctx.save();
  ctx.globalAlpha = 0.59;
  ctx.fillStyle = BRAND_BLUE;
  ctx.beginPath();
  ctx.ellipse(605, 24, 688, 209, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(573, -48, 688, 218, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 5. Small photo window at the top center, overlapping the waves.
  if (photo) {
    drawCover(ctx, photo, 251, -101, 572, 381);
  }

  // 6. Cyan accent square behind the tail of the logo.
  ctx.fillStyle = BRAND_CYAN;
  ctx.fillRect(605, 944, 58, 64);

  // 7. AGENDAX wordmark.
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.font = "400 68px Arimo, sans-serif";
  ctx.fillText("AGENDAX", W / 2, 984);

  // 8. Headline — auto-shrinks until it fits the title block.
  ctx.direction = "rtl";
  ctx.textBaseline = "top";
  let fontSize = 73;
  let lines: string[] = [];
  for (; fontSize >= 40; fontSize -= 3) {
    ctx.font = `700 ${fontSize}px Arimo, sans-serif`;
    lines = wrapLines(ctx, title, TITLE_MAX_WIDTH);
    if (lines.length * fontSize * TITLE_LINE_HEIGHT <= TITLE_MAX_HEIGHT) break;
  }
  lines.forEach((line, i) => {
    ctx.fillText(
      line,
      W / 2,
      TITLE_TOP + i * fontSize * TITLE_LINE_HEIGHT,
      TITLE_MAX_WIDTH,
    );
  });
};

const PostImageGenerator = ({
  article,
  open,
  onOpenChange,
}: PostImageGeneratorProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [title, setTitle] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && article) {
      setTitle(article.title);
      setCopied(false);
    }
  }, [open, article]);

  useEffect(() => {
    if (!open || !article) return;
    const timeout = setTimeout(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setIsRendering(true);
      try {
        await renderPost(canvas, title, article.imageUrl);
      } catch (error) {
        console.error("Error rendering post image:", error);
        toast.error("שגיאה ביצירת התמונה, נסו שוב");
      } finally {
        setIsRendering(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [open, article, title]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob>((resolve, reject) => {
        canvasRef.current?.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/png",
        );
      }),
    [],
  );

  const handleDownload = async () => {
    try {
      const blob = await toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agendax-post-${article?.slug || article?.id || "article"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading post image:", error);
      toast.error("שגיאה בהורדת התמונה");
    }
  };

  const handleCopy = async () => {
    try {
      const blob = await toBlob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      toast.success("התמונה הועתקה!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying post image:", error);
      toast.error("העתקת תמונה לא נתמכת בדפדפן הזה — השתמשו בהורדה");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            תמונת פוסט לפי תבנית Canva
          </DialogTitle>
          <DialogDescription>{article?.title}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[280px_1fr] py-2">
          <div className="relative mx-auto w-full max-w-[280px]">
            <canvas
              ref={canvasRef}
              className="w-full rounded-lg border shadow-sm"
              aria-label="תצוגה מקדימה של תמונת הפוסט"
            />
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="post-image-title" className="text-sm font-medium">
                כותרת על התמונה
              </label>
              <Textarea
                id="post-image-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[100px] text-sm leading-relaxed"
                dir="rtl"
              />
              <p className="text-xs text-muted-foreground">
                אפשר לקצר או לפצל שורות — התצוגה מתעדכנת אוטומטית. גודל:
                1080×1350 (מתאים לאינסטגרם ופייסבוק).
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleDownload}
                className="gap-2"
                disabled={isRendering}
              >
                <Download className="w-4 h-4" />
                הורד PNG
              </Button>
              <Button
                onClick={handleCopy}
                variant="outline"
                className="gap-2"
                disabled={isRendering}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "הועתק!" : "העתק ללוח"}
              </Button>
              <Button asChild variant="ghost" className="gap-2">
                <a
                  href={CANVA_TEMPLATE_EDIT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4" />
                  פתח את התבנית ב-Canva
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PostImageGenerator;
