// Tags that never have a closing tag, so they do not change nesting depth.
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "source", "track", "wbr",
]);

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;

/**
 * Splits article HTML after a top-level paragraph, about `ratio` of the way in,
 * so something can be rendered between the halves (a signup box mid-story).
 *
 * Only a </p> that closes at nesting depth zero is a candidate: cutting inside
 * a wrapper (a callout box, a list, a widget embed) would leave both halves
 * with broken markup. Returns null when the story is too short to interrupt.
 */
export const splitAtParagraph = (
  html: string,
  ratio = 0.4,
  minParagraphs = 6,
): [string, string] | null => {
  const ends: number[] = [];
  let depth = 0;
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(html)) !== null) {
    const [, closing, rawName, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name) || selfClosing) continue;
    if (closing) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && name === "p") ends.push(match.index + match[0].length);
    } else {
      depth += 1;
    }
  }
  if (ends.length < minParagraphs) return null;
  const at = ends[Math.max(1, Math.floor(ends.length * ratio)) - 1];
  return [html.slice(0, at), html.slice(at)];
};
