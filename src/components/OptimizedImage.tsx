import { cn } from "@/lib/utils";
import { responsiveImage } from "@/lib/imageUtils";

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
  // The candidate set lives in imageUtils so a plain <img> elsewhere (widget
  // banners, popups) can offer the same ladder without this wrapper.
  const img = responsiveImage(src, { width, quality, aspectRatio, sizes });

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
        src={img.src}
        {...(img.srcSet ? { srcSet: img.srcSet, sizes: img.sizes } : {})}
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
