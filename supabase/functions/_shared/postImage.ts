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

async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`image fetch failed: ${url.slice(0, 100)} ${resp.status}`);
  const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0];
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
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

const LTR_RUN = /[A-Za-z0-9]+(?:[.,'%+&#-][A-Za-z0-9]+)*/g;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };

const reverseSegment = (s: string) =>
  [...s].reverse().map((c) => MIRROR[c] ?? c).join("");

function toVisualLine(logical: string): string {
  const parts: { ltr: boolean; s: string }[] = [];
  let last = 0;
  for (const m of logical.matchAll(LTR_RUN)) {
    if ((m.index ?? 0) > last) parts.push({ ltr: false, s: logical.slice(last, m.index) });
    parts.push({ ltr: true, s: m[0] });
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < logical.length) parts.push({ ltr: false, s: logical.slice(last) });
  return parts
    .reverse()
    .map((p) => (p.ltr ? p.s : reverseSegment(p.s)))
    .join("");
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
