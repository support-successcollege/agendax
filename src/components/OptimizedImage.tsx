import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/imageUtils";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  priority?: boolean; // Skip lazy loading for above-the-fold images
  fetchPriority?: "high" | "low" | "auto";
  /** Target rendered width in CSS pixels. Used for Supabase image transformation. */
  width?: number;
  /** JPEG/WebP quality (1-100). Default 75. */
  quality?: number;
  /**
   * Target aspect ratio (width / height). When provided alongside `width`, the
   * image is requested from Supabase already cropped server-side to this ratio,
   * avoiding visible cropping issues with `object-cover` on portrait frames.
   */
  aspectRatio?: number;
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
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px", // Start loading 200px before entering viewport
        threshold: 0,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  // Account for high-DPI screens by requesting 2x the rendered width (capped at
  // 1600). Kept constant (not read from `window.devicePixelRatio`) so the
  // server-rendered markup matches the client and hydration stays clean.
  const dpr = 2;
  const requestedWidth = width ? Math.min(Math.round(width * dpr), 1600) : undefined;

  const requestedHeight =
    aspectRatio && requestedWidth ? Math.round(requestedWidth / aspectRatio) : undefined;
  const optimizedSrc = getOptimizedImageUrl(src, {
    width: requestedWidth,
    height: requestedHeight,
    quality,
    resize: requestedHeight ? "cover" : undefined,
  });

  return (
    <div ref={imgRef} className={cn("relative overflow-hidden bg-muted", wrapperClassName)}>
      {/* Placeholder skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      
      {/* Actual image - only load when in view */}
      {isInView && (
        <img
          src={optimizedSrc}
          alt={alt}
          {...(requestedWidth ? { width: requestedWidth } : {})}
          {...(requestedHeight ? { height: requestedHeight } : {})}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          {...(fetchPriority ? { fetchPriority } : {})}
          onLoad={() => setIsLoaded(true)}
          className={cn(
            !priority && "transition-opacity duration-500",
            !priority && (isLoaded ? "opacity-100" : "opacity-0"),
            priority && "opacity-100",
            className
          )}
        />
      )}
    </div>
  );
};

export default OptimizedImage;
