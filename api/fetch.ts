// A read-only fetch relay for news sites that block Supabase.
//
// From 06/09/2026 Cloudflare answers every request from the Supabase Edge
// Functions (AWS eu-west-1) with "Attention Required" (403) for Geektime,
// Times of Israel, People & Computers and others, while the same URLs load
// from an ordinary connection. The ingest functions therefore lost every
// Israeli tech source. This runs on Vercel, a different network, and relays
// GET requests for an allowlisted set of hosts only: feeds for the scanner,
// article pages for the writer.
//
//   GET /api/fetch?url=<encoded url>
//   header x-proxy-secret: <FETCH_PROXY_SECRET>
//
// Answers with the upstream status, content type and body (capped at 2MB).
// It is not an open proxy: unknown hosts get 403, anything but GET gets 405,
// and without the shared secret nothing is fetched at all.

export const config = { runtime: "nodejs", regions: ["fra1"], maxDuration: 20 };

const ALLOWED_HOSTS = [
  "geektime.co.il",
  "timesofisrael.com",
  "pc.co.il",
  "israelhayom.co.il",
  "zman.co.il",
  "maariv.co.il",
  "kan.org.il",
  "funder.co.il",
  "themarker.com",
  "calcalist.co.il",
];

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
  "Accept-Language": "he,en;q=0.8",
};

const allowed = (host: string) =>
  ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

const plain = (status: number, text: string) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(request: Request): Promise<Response> {
  // Trimmed on both sides: a value pasted from the clipboard into a dashboard
  // easily carries a trailing newline on one side and not the other.
  const secret = (process.env.FETCH_PROXY_SECRET || "").trim();
  if (!secret || (request.headers.get("x-proxy-secret") || "").trim() !== secret) return plain(401, "unauthorized");

  const raw = new URL(request.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return plain(400, "bad url");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return plain(400, "bad scheme");
  if (!allowed(target.hostname.toLowerCase())) return plain(403, "host not allowed");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(target, { redirect: "follow", signal: ctrl.signal, headers: BROWSER_HEADERS });
    // A redirect may not walk out of the allowlist.
    if (!allowed(new URL(upstream.url).hostname.toLowerCase())) return plain(403, "redirect left allowlist");

    const reader = upstream.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
      }
      await reader.cancel().catch(() => {});
    }
    const body = new Uint8Array(Math.min(size, MAX_BYTES));
    let offset = 0;
    for (const c of chunks) {
      const take = Math.min(c.byteLength, body.byteLength - offset);
      body.set(c.subarray(0, take), offset);
      offset += take;
      if (offset >= body.byteLength) break;
    }
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "x-upstream-url": upstream.url,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return plain(502, `upstream failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export function POST(): Response {
  return plain(405, "GET only");
}
