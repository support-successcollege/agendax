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

