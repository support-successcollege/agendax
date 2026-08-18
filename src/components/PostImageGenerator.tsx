import { useCallback, useEffect, useRef, useState } from "react";
import { Article } from "@/hooks/useArticles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import wordmark from "@/assets/agendax-wordmark.png";
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

// The layout below recreates the "agendax POST" template from the team's Canva
// account (design DAHSoWpkDsI, 1080×1350). Element geometry, colors and
// opacities were read from the template itself so the generated image matches
// what the template produces, without a Canva API round-trip. Template
// elements, each of which has a control in the dialog:
//   1. full-bleed article photo (page background)
//   2. dark gradient overlay (readability)
//   3. decorative waves along the top edge (blue + cream, translucent)
//   4. white logo card with the AGENDAX wordmark
//   5. category label with a blue highlight box behind its right half
//   6. bold white headline
const CANVA_TEMPLATE_EDIT_URL = "https://www.canva.com/d/wYa3qczymoZgFUo";

const W = 1080;
const H = 1350;

const BRAND_BLUE = "#0d3c99";
const CREAM = "#fef7f2";
const DARK_R = 7;
const DARK_G = 14;
const DARK_B = 35;

// Logo card (template element LBpFRQ6ZB0NMX4PS).
const LOGO_CARD = { x: 253, y: 0, w: 569, h: 150 };

// Category label (template elements LB3RjDB7FJzKBthF + LBVqd1cWZscrNCj6).
const CATEGORY_FONT_SIZE = 68;
const CATEGORY_CENTER_Y = 971;
const CATEGORY_BOX_TOP = 942;
const CATEGORY_BOX_HEIGHT = 64;

// Headline (template element LB3T1wjGkl7rRNP8).
const TITLE_MAX_WIDTH = 978;
const TITLE_TOP = 1024;
const TITLE_MAX_HEIGHT = H - TITLE_TOP - 36;
const TITLE_LINE_HEIGHT = 1.08;

export interface PostRenderOptions {
  title: string;
  category: string;
  imageUrl: string;
  /** 0..1 — strength of the dark overlay. */
  overlay: number;
  /** Max headline font size; auto-shrinks below this to fit. */
  titleSize: number;
  showLogo: boolean;
  showWaves: boolean;
  showCategoryHighlight: boolean;
  highlightColor: string;
}

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
  opts: PostRenderOptions,
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  canvas.width = W;
  canvas.height = H;

  // Arimo (the site font, covers Hebrew + Latin) must be resolved before any
  // measureText/fillText call, otherwise the canvas falls back silently.
  await Promise.all([
    document.fonts.load(`400 ${CATEGORY_FONT_SIZE}px Arimo`),
    document.fonts.load(`700 ${opts.titleSize}px Arimo`),
  ]).catch(() => undefined);

  let photo: HTMLImageElement | null = null;
  if (opts.imageUrl) {
    try {
      photo = await loadImage(opts.imageUrl);
    } catch {
      photo = null;
    }
  }
  let logo: HTMLImageElement | null = null;
  if (opts.showLogo) {
    try {
      logo = await loadImage(wordmark);
    } catch {
      logo = null;
    }
  }

  // 1. Full-bleed article photo (falls back to a brand gradient when the
  //    image can't be loaded, e.g. blocked by CORS).
  if (photo) {
    drawCover(ctx, photo, 0, 0, W, H);
  } else {
    const fallback = ctx.createLinearGradient(0, 0, 0, H);
    fallback.addColorStop(0, BRAND_BLUE);
    fallback.addColorStop(1, `rgb(${DARK_R},${DARK_G},${DARK_B})`);
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Dark overlay so the category and headline stay readable.
  const i = opts.overlay;
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, `rgba(${DARK_R},${DARK_G},${DARK_B},${0.45 * i})`);
  overlay.addColorStop(0.5, `rgba(${DARK_R},${DARK_G},${DARK_B},${0.7 * i})`);
  overlay.addColorStop(
    1,
    `rgba(${DARK_R},${DARK_G},${DARK_B},${Math.min(1, 1.18 * i)})`,
  );
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // 3. Decorative waves along the top edge (blue under cream, both translucent).
  if (opts.showWaves) {
    ctx.save();
    ctx.globalAlpha = 0.59;
    ctx.fillStyle = BRAND_BLUE;
    ctx.beginPath();
    ctx.ellipse(540, 33, 688, 209, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.ellipse(573, -48, 688, 218, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. White logo card at the top center, over the waves.
  if (opts.showLogo) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(LOGO_CARD.x, LOGO_CARD.y, LOGO_CARD.w, LOGO_CARD.h);
    if (logo) {
      const lw = LOGO_CARD.w * 0.8;
      const lh = lw * (logo.naturalHeight / logo.naturalWidth);
      ctx.drawImage(
        logo,
        LOGO_CARD.x + (LOGO_CARD.w - lw) / 2,
        LOGO_CARD.y + (LOGO_CARD.h - lh) / 2,
        lw,
        lh,
      );
    }
  }

  // 5. Category label with a highlight box behind its right half (in the
  //    template the box runs from the center of the word rightwards).
  const category = opts.category.trim();
  if (category) {
    ctx.font = `400 ${CATEGORY_FONT_SIZE}px Arimo, sans-serif`;
    if (opts.showCategoryHighlight) {
      const textWidth = ctx.measureText(category).width;
      const boxWidth = Math.min(textWidth / 2 + 45, W / 2 - 20);
      ctx.fillStyle = opts.highlightColor;
      ctx.fillRect(W / 2, CATEGORY_BOX_TOP, boxWidth, CATEGORY_BOX_HEIGHT);
    }
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";
    ctx.fillText(category, W / 2, CATEGORY_CENTER_Y);
  }

  // 6. Headline — auto-shrinks until it fits the title block.
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.textBaseline = "top";
  let fontSize = opts.titleSize;
  let lines: string[] = [];
  for (; fontSize >= 40; fontSize -= 3) {
    ctx.font = `700 ${fontSize}px Arimo, sans-serif`;
    lines = wrapLines(ctx, opts.title, TITLE_MAX_WIDTH);
    if (lines.length * fontSize * TITLE_LINE_HEIGHT <= TITLE_MAX_HEIGHT) break;
  }
  lines.forEach((line, i2) => {
    ctx.fillText(
      line,
      W / 2,
      TITLE_TOP + i2 * fontSize * TITLE_LINE_HEIGHT,
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
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [overlay, setOverlay] = useState(60);
  const [titleSize, setTitleSize] = useState(73);
  const [showLogo, setShowLogo] = useState(true);
  const [showWaves, setShowWaves] = useState(true);
  const [showCategoryHighlight, setShowCategoryHighlight] = useState(true);
  const [highlightColor, setHighlightColor] = useState(BRAND_BLUE);
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && article) {
      setTitle(article.title);
      setCategory(article.category);
      setImageUrl(article.imageUrl);
      setOverlay(60);
      setTitleSize(73);
      setShowLogo(true);
      setShowWaves(true);
      setShowCategoryHighlight(true);
      setHighlightColor(BRAND_BLUE);
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
        await renderPost(canvas, {
          title,
          category,
          imageUrl,
          overlay: overlay / 100,
          titleSize,
          showLogo,
          showWaves,
          showCategoryHighlight,
          highlightColor,
        });
      } catch (error) {
        console.error("Error rendering post image:", error);
        toast.error("שגיאה ביצירת התמונה, נסו שוב");
      } finally {
        setIsRendering(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [
    open,
    article,
    title,
    category,
    imageUrl,
    overlay,
    titleSize,
    showLogo,
    showWaves,
    showCategoryHighlight,
    highlightColor,
  ]);

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
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            תמונת פוסט לפי תבנית Canva
          </DialogTitle>
          <DialogDescription>{article?.title}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[300px_1fr] py-2">
          <div className="relative mx-auto w-full max-w-[300px] self-start">
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

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="post-image-title">כותרת</Label>
              <Textarea
                id="post-image-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[80px] text-sm leading-relaxed"
                dir="rtl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="post-image-category">קטגוריה</Label>
                <Input
                  id="post-image-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  dir="rtl"
                  placeholder="ריק = ללא קטגוריה"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="post-image-highlight-color">צבע הדגשה</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="post-image-highlight-color"
                    type="color"
                    value={highlightColor}
                    onChange={(e) => setHighlightColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                  />
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {highlightColor}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="post-image-url">תמונת רקע (URL)</Label>
              <Input
                id="post-image-url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                dir="ltr"
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>כהות הרקע ({overlay}%)</Label>
                <Slider
                  value={[overlay]}
                  onValueChange={([v]) => setOverlay(v)}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <div className="space-y-1">
                <Label>גודל כותרת ({titleSize}px)</Label>
                <Slider
                  value={[titleSize]}
                  onValueChange={([v]) => setTitleSize(v)}
                  min={48}
                  max={96}
                  step={1}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
                לוגו
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={showWaves} onCheckedChange={setShowWaves} />
                גלים למעלה
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={showCategoryHighlight}
                  onCheckedChange={setShowCategoryHighlight}
                />
                הדגשת קטגוריה
              </label>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={handleDownload}
                className="gap-2"
                disabled={isRendering}
              >
                <Download className="w-4 h-4" />
                הורד PNG (1080×1350)
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
