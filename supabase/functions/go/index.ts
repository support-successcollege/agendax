// deno-lint-ignore-file no-explicit-any
// The short link: agendax.co.il/a/<code> → the article.
//
// Every article's address carries its Hebrew headline as the slug, which reads
// well in a browser and is invisible to Meta: Messenger and Instagram stop
// recognising a link at the first non-Latin character, so a private message
// carrying one arrives as plain text the reader cannot tap. Percent-encoding
// it does not help, and neither does putting it on a line of its own — both
// were tried against the live product.
//
// So a link meant for a message is ASCII and short, and this turns it back
// into the real one. Vercel rewrites /a/:code here, which is what keeps the
// site's own domain on the link a reader sees.
//
// The code is the first eight characters of the article's id — enough to be
// unique in an archive of this size, and short enough to read out loud.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SITE_URL = "https://agendax.co.il";

const redirect = (to: string, status = 302) =>
  new Response(null, {
    status,
    headers: {
      Location: to,
      // A short link is a pointer, not a page: it must not be cached as one,
      // and it must not be indexed in place of the article.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Either form: the rewrite passes ?code=, a direct call may use the path.
  const code = (url.searchParams.get("code") || url.pathname.split("/").filter(Boolean).pop() || "")
    .trim()
    .toLowerCase();

  // Not a code we would ever hand out — do not touch the database for it.
  if (!/^[0-9a-f]{6,36}$/.test(code)) return redirect(SITE_URL);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // A function, because `id` is a uuid and Postgres has no ilike for one: the
  // query this replaced failed on every call and the failure looked exactly
  // like "no such article".
  const { data, error } = await supabase.rpc("article_by_short_code", { p_code: code });
  if (error) console.error("short link lookup failed:", error.message);

  const rows = (data ?? []) as { id: string; slug: string | null }[];
  // Two matches means the code was cut too short to be an answer; sending the
  // reader to the wrong article would be worse than sending them home.
  if (rows.length !== 1) return redirect(SITE_URL);

  // Percent-encoded because a header value may not carry non-Latin bytes —
  // the Hebrew slug threw on the way out and the redirect answered 500. The
  // reader never sees this form: they clicked the short link, and the browser
  // shows the address decoded.
  const target = `${SITE_URL}/article/${encodeURIComponent(rows[0].slug || rows[0].id)}`;
  // Tagged so a visit from a private message can be told apart from the rest
  // of the social traffic.
  const source = url.searchParams.get("s") || "dm";
  return redirect(`${target}?utm_source=${encodeURIComponent(source)}&utm_medium=social`);
});
