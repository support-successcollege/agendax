// Every category gets its own color, automatically and consistently: the same
// category always hashes to the same palette entry, on the site's cards and on
// the Canva-template post image alike. No table to maintain — a new category
// picks its color the moment it exists.
//
// All entries are dark enough to carry white text (the template draws the
// category name in white on top of this box).
export const CATEGORY_PALETTE = [
  "#0d3c99", // brand blue
  "#7c3aed", // violet
  "#0f766e", // teal
  "#be123c", // rose
  "#b45309", // amber
  "#166534", // green
  "#0e7490", // cyan
  "#9d174d", // magenta
] as const;

/**
 * Deterministic palette pick. Keyed by the category slug (stable across
 * renames of the display name); falls back to the name when no slug exists.
 */
export function categoryColor(key: string | null | undefined): string {
  const s = (key || "").trim().toLowerCase();
  if (!s) return CATEGORY_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}
