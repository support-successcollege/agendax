// Pings Google's Indexing API the moment an article goes live, instead of
// waiting for the next crawl. Fired by a DB trigger on articles (draft → live,
// covering the publish cron, the panel's "פרסם עכשיו" and direct inserts), and
// callable by an admin with {articleId} to re-submit any article.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";

const SITE_URL = "https://agendax.co.il";

function base64url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const unsigned = `${header}.${payload}`;

  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`Google token failed: ${(await resp.text()).slice(0, 200)}`);
  return (await resp.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const articleId = String(body?.articleId || "");
    if (!articleId) return json({ error: "חסר מזהה כתבה" }, 400);

    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!saJson) return json({ error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: article } = await supabase
      .from("articles")
      .select("id, slug, is_draft")
      .eq("id", articleId)
      .maybeSingle();
    if (!article) return json({ error: "הכתבה לא נמצאה" }, 404);
    if (article.is_draft) return json({ ok: false, skipped: "טיוטה — לא נשלחת לאינדוקס" });

    const url = `${SITE_URL}/article/${encodeURIComponent(article.slug || article.id)}`;
    const accessToken = await getAccessToken(JSON.parse(saJson));
    const resp = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    });
    const result = await resp.json().catch(() => ({}));
    console.log("indexing ping", url, resp.status, JSON.stringify(result).slice(0, 200));
    return json({ ok: resp.ok, url, status: resp.status, result });
  } catch (e) {
    console.error("index-article error", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});
