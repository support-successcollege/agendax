import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/imageUtils";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  /** Above the fold: loads eagerly and is never deferred. */
  priority?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  /** Rendered width in CSS pixels at the widest breakpoint. Drives the candidate set. */
  width?: number;
  /** JPEG/WebP quality (1-100). Default 75. */
  quality?: number;
  /**
   * Target aspect ratio (width / height). When provided alongside `width`, the
   * image is requested from Supabase already cropped server-side to this ratio,
   * avoiding visible cropping issues with `object-cover` on portrait frames.
   */
  aspectRatio?: number;
  /**
   * The `sizes` attribute. Without it the browser assumes the image fills the
   * viewport and picks the largest candidate — which is how a phone ends up
   * downloading a desktop-sized hero. Defaults to the element's own width.
   */
  sizes?: string;
}

/**
 * The candidate widths offered to the browser. Chosen to land on the common
 * rendered sizes across the site (thumb, card, column, hero) rather than a
 * generic ladder, so the browser rarely has to round far upward.
 */
const CANDIDATE_WIDTHS = [320, 480, 640, 828, 1080, 1280, 1600];

const OptimizedImage = ({
  src,
  alt,
  className,
  wrapperClassName,
  priority = false,
  fetchPriority,
  width,
  quality,
  aspectRatio,
  sizes,
}: OptimizedImageProps) => {
  // The widest candidate worth offering: twice the rendered width covers 2x
  // screens, capped so a card never pulls a hero-sized file.
  const maxWidth = Math.min(Math.round((width ?? 800) * 2), 1600);
  const candidates = CANDIDATE_WIDTHS.filter((w) => w <= maxWidth);
  if (candidates.length === 0 || candidates[candidates.length - 1] !== maxWidth) {
    candidates.push(maxWidth);
  }

  const urlFor = (w: number) =>
    getOptimizedImageUrl(src, {
      width: w,
      height: aspectRatio ? Math.round(w / aspectRatio) : undefined,
      quality,
      resize: aspectRatio ? "cover" : undefined,
    });

  // The transform endpoint negotiates the format from Accept, so one candidate
  // set serves AVIF, WebP or JPEG depending on the browser — no separate
  // <source> per format needed.
  const srcSet = candidates.map((w) => `${urlFor(w)} ${w}w`).join(", ");
  const fallbackWidth = candidates[Math.min(1, candidates.length - 1)];

  // `sizes` defaults to the rendered width. Telling the browser the real
  // display size is what stops a 375px phone from choosing the 1600px file.
  const sizesAttr = sizes ?? (width ? `(max-width: ${width}px) 100vw, ${width}px` : "100vw");

  return (
    <div className={cn("relative overflow-hidden bg-muted", wrapperClassName)}>
      {/* Rendered unconditionally, including during prerender: an <img> that
          only appears after an IntersectionObserver fires is an <img> that
          never reaches the crawler, and Google Images cannot index what is not
          in the HTML. Native lazy loading does the deferring instead.

          No JS-driven fade either: an image that starts at opacity-0 waiting
          for an onLoad handler stays invisible when the browser served it from
          cache before React attached, and when JS never runs at all. */}
      <img
        src={urlFor(fallbackWidth)}
        srcSet={srcSet}
        sizes={sizesAttr}
        alt={alt}
        {...(width ? { width } : {})}
        {...(width && aspectRatio ? { height: Math.round(width / aspectRatio) } : {})}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        {...(fetchPriority ? { fetchPriority } : {})}
        className={cn(className)}
      />
    </div>
  );
};

export default OptimizedImage;
