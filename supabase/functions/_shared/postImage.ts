// deno-lint-ignore-file no-explicit-any
// Server-side rendering of the branded post image — the same Canva-template
// composition the site's cards and the admin's PNG generator draw (photo,
// dark overlay, wave band, wordmark, category color box, centered headline)
// — built with satori (JSX-tree → SVG) and resvg (SVG → PNG), so the social
// pipeline can produce it with no browser in sight.
import satori from "npm:satori@0.18.3";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const W = 1080;
const H = 1350;
const BRAND_BLUE = "#0d3c99";
const CREAM = "#fef7f2";
const WORDMARK_URL = "https://agendax.co.il/brand/wordmark-light.png";

/** Category → brand colour, stable per category. Shared by every branded render. */
const PALETTE = ["#0d3c99", "#7c3aed", "#0f766e", "#be123c", "#b45309", "#166534", "#0e7490", "#9d174d"];
export function categoryColor(key: string): string {
  const s = (key || "").trim().toLowerCase();
  if (!s) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// ---- lazy, cached heavy assets (survive across warm invocations) ----------
let wasmReady: Promise<void> | null = null;
let fontsReady: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]> | null = null;
let wordmarkReady: Promise<string> | null = null;

const ensureWasm = () =>
  (wasmReady ??= fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")
    .then((r) => r.arrayBuffer())
    .then((buf) => initWasm(buf)));

const FONT_URLS: { url: string; weight: 400 | 700 }[] = [
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/assistant@5.0.13/files/assistant-hebrew-400-normal.woff", weight: 400 },
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/assistant@5.0.13/files/assistant-hebrew-700-normal.woff", weight: 700 },
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/assistant@5.0.13/files/assistant-latin-400-normal.woff", weight: 400 },
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/assistant@5.0.13/files/assistant-latin-700-normal.woff", weight: 700 },
];

// The Hebrew and Latin subsets get distinct family names: satori's glyph
// fallback walks the font list across families, but within one family it
// stops at the first weight match — which left "AI" as tofu boxes.
const ensureFonts = () =>
  (fontsReady ??= Promise.all(
    FONT_URLS.map(async ({ url, weight }, i) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`font fetch failed: ${url} ${resp.status}`);
      return {
        name: i < 2 ? "Assistant" : "AssistantLatin",
        data: await resp.arrayBuffer(),
        weight,
        style: "normal" as const,
      };
    }),
  ));

/** What satori's image decoder actually understands. */
const SATORI_SAFE = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/svg+xml"]);

/**
 * Storage's transform endpoint re-encodes on the way out, so the same object
 * comes back as JPEG. Only objects in our own bucket can take this route.
 */
function transcodeUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const base = url.slice(0, at) + "/storage/v1/render/image/public/" + url.slice(at + marker.length);
  return `${base}${base.includes("?") ? "&" : "?"}width=1200&quality=82&resize=contain`;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchImage(url: string): Promise<{ mime: string; bytes: Uint8Array }> {
  const resp = await fetch(url, { headers: { Accept: "image/jpeg,image/png,image/*;q=0.8" } });
  if (!resp.ok) throw new Error(`image fetch failed: ${url.slice(0, 100)} ${resp.status}`);
  return {
    mime: (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase(),
    bytes: new Uint8Array(await resp.arrayBuffer()),
  };
}

async function toDataUrl(url: string): Promise<string> {
  // Own-bucket images always take the transform endpoint — not only the ones
  // in a format satori cannot read. The transform caps the pixel size on the
  // way out, and a full-resolution source photo (a 900 KB JPEG is routine in
  // the ingest bucket) exhausts the render worker's memory long before satori
  // sees the bytes. That surfaces as a bare 546 WORKER_RESOURCE_LIMIT with no
  // error of its own, which is what made it hard to place.
  const transformed = transcodeUrl(url);

  let mime: string;
  let bytes: Uint8Array;
  if (transformed) {
    try {
      ({ mime, bytes } = await fetchImage(transformed));
    } catch {
      // Transform unavailable for this object: the original is still better
      // than no image at all.
      ({ mime, bytes } = await fetchImage(url));
    }
  } else {
    ({ mime, bytes } = await fetchImage(url));
  }

  // AVIF and WebP reach satori as undecodable bytes and fail deep inside it,
  // with an error that says nothing about the image. The transform re-encodes
  // to JPEG, so this only bites on images that could not be routed through it.
  if (!SATORI_SAFE.has(mime)) {
    throw new Error(
      transformed
        ? `המרת התמונה מ-${mime} נכשלה`
        : `תמונת המקור בפורמט ${mime} שאי אפשר לרנדר`,
    );
  }

  return `data:${mime};base64,${toBase64(bytes)}`;
}

const ensureWordmark = () => (wordmarkReady ??= toDataUrl(WORDMARK_URL));

// satori takes a plain element tree — no React needed.
const h = (type: string, props: Record<string, any>, ...children: any[]) => ({
  type,
  props: { ...props, children: children.length <= 1 ? children[0] : children },
});

// ---- manual bidi ----------------------------------------------------------
// satori draws glyphs in string order with no bidi reordering, which rendered
// Hebrew mirror-image. So the layout is done here: lines are broken manually,
// then each line is converted to VISUAL order — the whole line reversed,
// except LTR islands (Latin words, numbers) which keep their internal order,
// with paired brackets mirrored. What satori then draws left-to-right reads
// correctly right-to-left.

// A single right-to-left paragraph, no embeddings: the subset of UAX #9 that
// such a line needs. Each character gets a bidi class, the weak and neutral
// rules resolve it to a direction, and the line is reordered by level.
type BidiClass = "R" | "L" | "EN" | "ET" | "CS" | "ON";

const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const LETTER = /\p{L}/u;
const DIGIT = /[0-9]/;
// European terminators: they stick to an adjacent number ("50%", "$100").
const TERMINATOR = /[%$€£¥₪°#+\u2030\u2031]/;
// Separators that stay inside a number when flanked by digits ("5.1", "1,000").
const SEPARATOR = /[.,:\/\-]/;

const MIRROR: Record<string, string> = {
  "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«",
};

const classOf = (c: string): BidiClass =>
  HEBREW.test(c) ? "R"
  : LETTER.test(c) ? "L"
  : DIGIT.test(c) ? "EN"
  : TERMINATOR.test(c) ? "ET"
  : SEPARATOR.test(c) ? "CS"
  : "ON";

/** Logical Hebrew/English line → the order satori must draw it, left to right. */
function toVisualLine(logical: string): string {
  const chars = [...logical];
  const n = chars.length;
  if (n === 0) return logical;
  const original = chars.map(classOf);
  const t = [...original];

  // W4: one separator between two digits belongs to the number.
  for (let i = 1; i < n - 1; i++) {
    if (t[i] === "CS" && t[i - 1] === "EN" && t[i + 1] === "EN") t[i] = "EN";
  }
  // W5: a run of terminators touching a number joins it.
  for (let i = 0; i < n; ) {
    if (t[i] !== "ET") { i++; continue; }
    let j = i;
    while (j < n && t[j] === "ET") j++;
    if ((i > 0 && t[i - 1] === "EN") || (j < n && t[j] === "EN")) {
      for (let k = i; k < j; k++) t[k] = "EN";
    }
    i = j;
  }
  // W6: whatever is left over is plain neutral.
  for (let i = 0; i < n; i++) if (t[i] === "ET" || t[i] === "CS") t[i] = "ON";

  // W7: a number that follows English is English ("GPT 5", "iPhone 17").
  // The paragraph is right-to-left, so the start of the line counts as Hebrew.
  let lastStrong: "L" | "R" = "R";
  for (let i = 0; i < n; i++) {
    if (original[i] === "L" || original[i] === "R") lastStrong = original[i] as "L" | "R";
    else if (t[i] === "EN" && lastStrong === "L") t[i] = "L";
  }

  // N1/N2: neutrals take the direction of their neighbours when both agree,
  // otherwise the paragraph's. Remaining numbers count as right-to-left here.
  const side = (x: BidiClass): "L" | "R" => (x === "L" ? "L" : "R");
  for (let i = 0; i < n; ) {
    if (t[i] !== "ON") { i++; continue; }
    let j = i;
    while (j < n && t[j] === "ON") j++;
    const before = i > 0 ? side(t[i - 1]) : "R";
    const after = j < n ? side(t[j]) : "R";
    const dir = before === after ? before : "R";
    for (let k = i; k < j; k++) t[k] = dir;
    i = j;
  }

  // I2: in a right-to-left paragraph, English and numbers sit one level up.
  const level = t.map((x) => (x === "R" ? 1 : 2));

  // L4: mirror paired brackets that end up right-to-left.
  const glyphs = chars.map((c, i) => (level[i] === 1 ? MIRROR[c] ?? c : c));

  // L2: reverse every run at level 2, then the whole line.
  for (let i = 0; i < n; ) {
    if (level[i] !== 2) { i++; continue; }
    let j = i;
    while (j < n && level[j] === 2) j++;
    const run = glyphs.slice(i, j).reverse();
    for (let k = i; k < j; k++) glyphs[k] = run[k - i];
    i = j;
  }
  return glyphs.reverse().join("");
}

/** Mirrors the canvas version's auto-shrink: try sizes until the title fits
 * three lines of the 978px block (Assistant averages ~0.52em per char). */
function layoutTitle(title: string): { size: number; lines: string[] } {
  for (const size of [72, 66, 60, 54, 48, 44, 40]) {
    const perLine = Math.floor(978 / (size * 0.52));
    const words = title.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cur && cand.length > perLine) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cand;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= 3) return { size, lines: lines.map(toVisualLine) };
  }
  return { size: 40, lines: [toVisualLine(title.slice(0, 120))] };
}

export async function renderPostPng(opts: {
  title: string;
  category: string;
  categoryColor: string;
  photoUrl: string;
}): Promise<Uint8Array> {
  const [fonts, wordmark, photo] = await Promise.all([
    ensureFonts(),
    ensureWordmark(),
    toDataUrl(opts.photoUrl),
    ensureWasm(),
  ]);

  const tree = h(
    "div",
    {
      style: {
        width: `${W}px`,
        height: `${H}px`,
        display: "flex",
        position: "relative",
        fontFamily: "Assistant, AssistantLatin",
        overflow: "hidden",
      },
    },
    h("img", {
      src: photo,
      width: W,
      height: H,
      style: { position: "absolute", top: 0, left: 0, width: `${W}px`, height: `${H}px`, objectFit: "cover" },
    }),
    // Dark overlay (the canvas template's gradient at its default strength).
    h("div", {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: `${W}px`,
        height: `${H}px`,
        background:
          "linear-gradient(to bottom, rgba(7,14,35,0.27) 0%, rgba(7,14,35,0.42) 50%, rgba(7,14,35,0.71) 100%)",
      },
    }),
    // Wave band: two translucent ellipses along the top edge.
    h("div", {
      style: {
        position: "absolute",
        left: "-148px",
        top: "-176px",
        width: "1376px",
        height: "418px",
        borderRadius: "50%",
        backgroundColor: BRAND_BLUE,
        opacity: 0.59,
      },
    }),
    h("div", {
      style: {
        position: "absolute",
        left: "-115px",
        top: "-266px",
        width: "1376px",
        height: "437px",
        borderRadius: "50%",
        backgroundColor: CREAM,
        opacity: 0.5,
      },
    }),
    // Wordmark (600px wide, centered on y=82; 800x107 source → 80px tall).
    h("img", {
      src: wordmark,
      width: 600,
      height: 80,
      style: { position: "absolute", left: "240px", top: "42px", width: "600px", height: "80px" },
    }),
    // Category on its color box.
    h(
      "div",
      {
        style: {
          position: "absolute",
          top: "931px",
          left: 0,
          width: `${W}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      h(
        "div",
        {
          style: {
            backgroundColor: opts.categoryColor,
            color: "#ffffff",
            fontSize: "58px",
            height: "75px",
            padding: "0 45px",
            display: "flex",
            alignItems: "center",
            letterSpacing: "2px",
          },
        },
        toVisualLine(opts.category),
      ),
    ),
    // Headline — pre-broken lines in visual order, stacked as rows.
    (() => {
      const { size, lines } = layoutTitle(opts.title);
      return h(
        "div",
        {
          style: {
            position: "absolute",
            top: "1024px",
            left: "51px",
            width: "978px",
            height: "290px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          },
        },
        ...lines.map((line) =>
          h(
            "div",
            {
              style: {
                fontSize: `${size}px`,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.08,
                letterSpacing: "1.5px",
                whiteSpace: "nowrap",
              },
            },
            line,
          ),
        ),
      );
    })(),
  );

  const svg = await satori(tree as any, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  return png;
}

// ---- story variant (1080×1920) ---------------------------------------------
// Same composition stretched to 9:16, plus a call-to-action footer carrying
// the site address: stories published through the API cannot hold a link
// sticker, so the pointer to the article is baked into the pixels.
const SW = 1080;
const SH = 1920;

export async function renderStoryPng(opts: {
  title: string;
  category: string;
  categoryColor: string;
  photoUrl: string;
  ctaHost?: string;
}): Promise<Uint8Array> {
  const [fonts, wordmark, photo] = await Promise.all([
    ensureFonts(),
    ensureWordmark(),
    toDataUrl(opts.photoUrl),
    ensureWasm(),
  ]);
  const { size, lines } = layoutTitle(opts.title);
  const ctaHost = opts.ctaHost ?? "agendax.co.il";

  const tree = h(
    "div",
    {
      style: {
        width: `${SW}px`,
        height: `${SH}px`,
        display: "flex",
        position: "relative",
        fontFamily: "Assistant, AssistantLatin",
        overflow: "hidden",
        backgroundColor: "#07142a",
      },
    },
    h("img", {
      src: photo,
      width: SW,
      height: SH,
      style: { position: "absolute", top: 0, left: 0, width: `${SW}px`, height: `${SH}px`, objectFit: "cover" },
    }),
    h("div", {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: `${SW}px`,
        height: `${SH}px`,
        background:
          "linear-gradient(to bottom, rgba(7,14,35,0.30) 0%, rgba(7,14,35,0.35) 45%, rgba(7,14,35,0.82) 100%)",
      },
    }),
    h("div", {
      style: {
        position: "absolute",
        left: "-148px",
        top: "-176px",
        width: "1376px",
        height: "418px",
        borderRadius: "50%",
        backgroundColor: BRAND_BLUE,
        opacity: 0.59,
      },
    }),
    h("div", {
      style: {
        position: "absolute",
        left: "-115px",
        top: "-266px",
        width: "1376px",
        height: "437px",
        borderRadius: "50%",
        backgroundColor: CREAM,
        opacity: 0.5,
      },
    }),
    h("img", {
      src: wordmark,
      width: 600,
      height: 80,
      style: { position: "absolute", left: "240px", top: "60px", width: "600px", height: "80px" },
    }),
    // Category box
    h(
      "div",
      {
        style: {
          position: "absolute",
          top: "1180px",
          left: 0,
          width: `${SW}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      h(
        "div",
        {
          style: {
            backgroundColor: opts.categoryColor,
            color: "#ffffff",
            fontSize: "58px",
            height: "75px",
            padding: "0 45px",
            display: "flex",
            alignItems: "center",
            letterSpacing: "2px",
          },
        },
        toVisualLine(opts.category),
      ),
    ),
    // Headline
    h(
      "div",
      {
        style: {
          position: "absolute",
          top: "1275px",
          left: "51px",
          width: "978px",
          height: "330px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        },
      },
      ...lines.map((line) =>
        h(
          "div",
          {
            style: {
              fontSize: `${size}px`,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.08,
              letterSpacing: "1.5px",
              whiteSpace: "nowrap",
            },
          },
          line,
        ),
      ),
    ),
    // CTA footer: "read the full article at" + the address, in a pill.
    h(
      "div",
      {
        style: {
          position: "absolute",
          top: "1660px",
          left: 0,
          width: `${SW}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        },
      },
      h(
        "div",
        { style: { fontSize: "38px", color: "rgba(255,255,255,0.85)", letterSpacing: "1px" } },
        toVisualLine("לכתבה המלאה באתר"),
      ),
      h(
        "div",
        {
          style: {
            marginTop: "18px",
            backgroundColor: "#ffffff",
            color: BRAND_BLUE,
            fontSize: "50px",
            fontWeight: 700,
            padding: "14px 56px",
            borderRadius: "999px",
            letterSpacing: "1px",
          },
        },
        ctaHost,
      ),
    ),
  );

  const svg = await satori(tree as any, { width: SW, height: SH, fonts });
  // Rasterized at 720×1280 (plenty for a phone story): the full 1080×1920
  // raster pushed the edge worker past its CPU budget.
  return new Resvg(svg, { fitTo: { mode: "width", value: 720 } }).render().asPng();
}

// ---- carousel slide (1080×1350) --------------------------------------------
// A carousel slide carries a paragraph, not just a headline, so the text sits
// on a heavier overlay than the post and wraps to more lines. The background is
// an AI image generated for that slide; the words are always drawn here —
// image models cannot be trusted to spell Hebrew.

const CW = 1080;
const CH = 1350;
const CYAN = "#22d3ee";

/**
 * Greedy line-breaking at the largest size that fits `maxLines`, returned in
 * visual order. Assistant averages ~0.52em per character; Hebrew runs a touch
 * narrower and the margin absorbs the difference.
 */
function layoutBlock(
  text: string,
  width: number,
  sizes: number[],
  maxLines: number,
): { size: number; lines: string[] } {
  const words = text.split(/\s+/).filter(Boolean);
  for (const size of sizes) {
    const perLine = Math.max(8, Math.floor(width / (size * 0.52)));
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cur && cand.length > perLine) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cand;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines) return { size, lines: lines.map(toVisualLine) };
  }
  // Still too long at the smallest size: keep what fits and mark the cut.
  const size = sizes[sizes.length - 1];
  const perLine = Math.max(8, Math.floor(width / (size * 0.52)));
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && cand.length > perLine) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = cand;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const kept = lines.slice(0, maxLines);
  kept[kept.length - 1] = `${kept[kept.length - 1].replace(/[.,;:]$/, "")}…`;
  return { size, lines: kept.map(toVisualLine) };
}

const textRows = (lines: string[], style: Record<string, unknown>) =>
  lines.map((line) => h("div", { style: { whiteSpace: "nowrap", display: "flex", ...style } }, line));

export async function renderCarouselSlidePng(opts: {
  kind: "cover" | "point" | "cta";
  title: string;
  body: string;
  index: number;
  total: number;
  category: string;
  categoryColor: string;
  photoUrl: string;
  ctaHost?: string;
}): Promise<Uint8Array> {
  const [fonts, wordmark, photo] = await Promise.all([
    ensureFonts(),
    ensureWordmark(),
    toDataUrl(opts.photoUrl),
    ensureWasm(),
  ]);
  const ctaHost = opts.ctaHost ?? "agendax.co.il";
  const PAD = 84;
  const TEXT_W = CW - PAD * 2;

  // The cover lets the image breathe at the top; the other slides need the
  // paragraph legible over whatever the picture happens to be.
  const overlay = opts.kind === "cover"
    ? "linear-gradient(to bottom, rgba(5,10,28,0.30) 0%, rgba(5,10,28,0.35) 40%, rgba(5,10,28,0.92) 100%)"
    : "linear-gradient(to bottom, rgba(5,10,28,0.55) 0%, rgba(5,10,28,0.78) 45%, rgba(5,10,28,0.94) 100%)";

  const header = [
    // Wordmark at the reading start (right) — small, it is a signature here.
    h("img", {
      src: wordmark,
      width: 330,
      height: 44,
      style: { position: "absolute", right: `${PAD}px`, top: "64px", width: "330px", height: "44px" },
    }),
    // Slide counter, LTR by nature ("3/7").
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: `${PAD}px`,
          top: "58px",
          height: "56px",
          padding: "0 22px",
          borderRadius: "999px",
          backgroundColor: "rgba(255,255,255,0.14)",
          border: "2px solid rgba(255,255,255,0.28)",
          color: "#ffffff",
          fontSize: "30px",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
        },
      },
      `${opts.index + 1}/${opts.total}`,
    ),
  ];

  let content: any;
  if (opts.kind === "cover") {
    const title = layoutBlock(opts.title, TEXT_W, [92, 84, 76, 68, 60, 54], 4);
    const sub = opts.body ? layoutBlock(opts.body, TEXT_W, [40, 36, 32], 2) : null;
    content = h(
      "div",
      {
        style: {
          position: "absolute",
          right: `${PAD}px`,
          bottom: "96px",
          width: `${TEXT_W}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        },
      },
      h(
        "div",
        {
          style: {
            backgroundColor: opts.categoryColor,
            color: "#ffffff",
            fontSize: "34px",
            fontWeight: 700,
            padding: "8px 26px",
            marginBottom: "28px",
            display: "flex",
          },
        },
        toVisualLine(opts.category),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
        ...textRows(title.lines, {
          fontSize: `${title.size}px`,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.08,
        }),
      ),
      sub
        ? h(
          "div",
          { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: "26px" } },
          ...textRows(sub.lines, { fontSize: `${sub.size}px`, color: "rgba(255,255,255,0.86)", lineHeight: 1.3 }),
        )
        : h("div", { style: { display: "flex" } }),
      h(
        "div",
        {
          style: {
            marginTop: "40px",
            fontSize: "32px",
            fontWeight: 700,
            color: CYAN,
            display: "flex",
            alignItems: "center",
          },
        },
        // Drawn, not typed: the font has no arrow glyph. It points left, where the
        // next slide comes from.
        h(
          "svg",
          { width: 40, height: 24, viewBox: "0 0 40 24", style: { marginLeft: "0px", marginRight: "14px" } },
          h("path", {
            d: "M14 3 L4 12 L14 21 M4 12 L38 12",
            stroke: CYAN,
            "stroke-width": 4,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            fill: "none",
          }),
        ),
        toVisualLine("החליקו לקריאה"),
      ),
    );
  } else if (opts.kind === "point") {
    const title = layoutBlock(opts.title, TEXT_W, [66, 60, 54, 48, 44], 3);
    const body = layoutBlock(opts.body, TEXT_W, [42, 39, 36, 33, 30], 8);
    content = h(
      "div",
      {
        style: {
          position: "absolute",
          right: `${PAD}px`,
          top: "300px",
          width: `${TEXT_W}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        },
      },
      // The point's number, in the category colour.
      h(
        "div",
        {
          style: {
            fontSize: "120px",
            fontWeight: 700,
            color: opts.categoryColor === "#0d3c99" ? CYAN : opts.categoryColor,
            lineHeight: 1,
            display: "flex",
          },
        },
        String(opts.index).padStart(2, "0"),
      ),
      h("div", {
        style: { width: "120px", height: "8px", backgroundColor: CYAN, marginTop: "24px", marginBottom: "34px", display: "flex" },
      }),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
        ...textRows(title.lines, { fontSize: `${title.size}px`, fontWeight: 700, color: "#ffffff", lineHeight: 1.12 }),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: "30px" } },
        ...textRows(body.lines, { fontSize: `${body.size}px`, color: "rgba(255,255,255,0.9)", lineHeight: 1.36 }),
      ),
    );
  } else {
    const title = layoutBlock(opts.title, TEXT_W, [80, 72, 64, 56, 50], 3);
    const body = opts.body ? layoutBlock(opts.body, TEXT_W, [42, 38, 34], 4) : null;
    content = h(
      "div",
      {
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: `${CW}px`,
          height: `${CH}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      ...textRows(title.lines, { fontSize: `${title.size}px`, fontWeight: 700, color: "#ffffff", lineHeight: 1.1 }),
      body
        ? h(
          "div",
          { style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: "34px" } },
          ...textRows(body.lines, { fontSize: `${body.size}px`, color: "rgba(255,255,255,0.88)", lineHeight: 1.34 }),
        )
        : h("div", { style: { display: "flex" } }),
      h(
        "div",
        {
          style: {
            marginTop: "64px",
            backgroundColor: "#ffffff",
            color: BRAND_BLUE,
            fontSize: "58px",
            fontWeight: 700,
            padding: "18px 64px",
            borderRadius: "999px",
            display: "flex",
          },
        },
        ctaHost,
      ),
    );
  }

  const tree = h(
    "div",
    {
      style: {
        width: `${CW}px`,
        height: `${CH}px`,
        display: "flex",
        position: "relative",
        fontFamily: "Assistant, AssistantLatin",
        overflow: "hidden",
        backgroundColor: "#050a1c",
      },
    },
    h("img", {
      src: photo,
      width: CW,
      height: CH,
      style: { position: "absolute", top: 0, left: 0, width: `${CW}px`, height: `${CH}px`, objectFit: "cover" },
    }),
    h("div", {
      style: { position: "absolute", top: 0, left: 0, width: `${CW}px`, height: `${CH}px`, background: overlay },
    }),
    ...header,
    content,
  );

  const svg = await satori(tree as any, { width: CW, height: CH, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: CW } }).render().asPng();
}
