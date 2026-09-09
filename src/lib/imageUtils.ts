/**
 * Transform a Supabase Storage public URL to use the Image Transformation API.
 * - Converts to WebP automatically (when supported by the browser)
 * - Resizes to the requested width
 * - Applies quality compression
 *
 * Non-Supabase URLs (e.g. external images, local assets) are returned unchanged.
 */
export function getOptimizedImageUrl(
  url: string | undefined | null,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    resize?: "cover" | "contain" | "fill";
  } = {}
): string {
  if (!url || typeof url !== "string") return url || "";

  // Only transform Supabase Storage public object URLs
  const publicMarker = "/storage/v1/object/public/";
  if (!url.includes(publicMarker)) return url;

  // Already a transformation URL (idempotent)
  if (url.includes("/storage/v1/render/image/public/")) return url;

  const transformedBase = url.replace(publicMarker, "/storage/v1/render/image/public/");

  const params = new URLSearchParams();
  if (options.width) params.set("width", String(options.width));
  if (options.height) params.set("height", String(options.height));
  params.set("quality", String(options.quality ?? 75));
  // Only apply resize mode if explicitly provided. Without it, Supabase keeps
  // the original aspect ratio (height auto-calculated from width), preventing cropping.
  if (options.resize) params.set("resize", options.resize);

  return `${transformedBase}?${params.toString()}`;
}


/**
 * The same photograph at the three aspect ratios Google asks a NewsArticle to
 * offer. The transform endpoint crops each one on demand from the single
 * stored file, so this costs no extra storage and no extra upload.
 */
export function imageVariants(url: string | undefined | null): string[] {
  if (!url) return [];
  const ratios: [number, number][] = [
    [1200, 675], // 16:9
    [1200, 900], // 4:3
    [1200, 1200], // 1:1
  ];
  const variants = ratios.map(([width, height]) =>
    getOptimizedImageUrl(url, { width, height, quality: 82, resize: "cover" }),
  );
  // A non-Supabase URL comes back untransformed and identical three times;
  // offering the same address as three variants says nothing.
  return [...new Set(variants)];
}


/**
 * The candidate widths offered to the browser. Chosen to land on the common
 * rendered sizes across the site (thumb, card, column, hero) rather than a
 * generic ladder, so the browser rarely has to round far upward.
 */
export const CANDIDATE_WIDTHS = [320, 480, 640, 828, 1080, 1280, 1600];

export interface ResponsiveImageOptions {
  /** Rendered width in CSS pixels at the widest breakpoint. Drives the candidate set. */
  width?: number;
  /** JPEG/WebP quality (1-100). Default 75. */
  quality?: number;
  /**
   * Target aspect ratio (width / height). With `width`, every candidate is
   * cropped server-side to this ratio, so `object-cover` never has to.
   */
  aspectRatio?: number;
  /**
   * The `sizes` attribute. Without it the browser assumes the image fills the
   * viewport and picks the largest candidate, which is how a phone ends up
   * downloading a desktop-sized hero. Defaults to the element's own width.
   */
  sizes?: string;
}

export interface ResponsiveImage {
  src: string;
  /** Absent for URLs the transform endpoint cannot serve (external, local). */
  srcSet?: string;
  sizes?: string;
}

/**
 * `src` + `srcSet` + `sizes` for one image from Supabase Storage, so the
 * browser can pick the file that matches its viewport and pixel density. The
 * transform endpoint negotiates the format from Accept, so a single candidate
 * set serves AVIF, WebP or JPEG.
 *
 * External URLs (Unsplash, local assets, an already-transformed URL) come back
 * as a bare `src`: offering the same address seven times says nothing.
 */
export function responsiveImage(
  url: string | undefined | null,
  options: ResponsiveImageOptions = {},
): ResponsiveImage {
  if (!url) return { src: "" };
  if (!url.includes("/storage/v1/object/public/")) return { src: url };

  const { width, quality, aspectRatio, sizes } = options;

  // The widest candidate worth offering: twice the rendered width covers 2x
  // screens, capped so a card never pulls a hero-sized file.
  const maxWidth = Math.min(Math.round((width ?? 800) * 2), 1600);
  const candidates = CANDIDATE_WIDTHS.filter((w) => w <= maxWidth);
  if (candidates.length === 0 || candidates[candidates.length - 1] !== maxWidth) {
    candidates.push(maxWidth);
  }

  const urlFor = (w: number) =>
    getOptimizedImageUrl(url, {
      width: w,
      height: aspectRatio ? Math.round(w / aspectRatio) : undefined,
      quality,
      resize: aspectRatio ? "cover" : undefined,
    });

  const fallbackWidth = candidates[Math.min(1, candidates.length - 1)]!;

  return {
    src: urlFor(fallbackWidth),
    srcSet: candidates.map((w) => `${urlFor(w)} ${w}w`).join(", "),
    // Telling the browser the real display size is what stops a 375px phone
    // from choosing the 1600px file.
    sizes: sizes ?? (width ? `(max-width: ${width}px) 100vw, ${width}px` : "100vw"),
  };
}
