import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";

// Base64url encode
function base64url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Create JWT for Google Service Account
async function createJWT(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const pemContent = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  
  const keyData = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = base64url(new Uint8Array(signature));
  return `${unsignedToken}.${signatureB64}`;
}

// Get access token from Google
async function getAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const jwt = await createJWT(serviceAccount);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Two callers: the admin pressing the button, and the daily cron carrying
  // the shared secret. Anyone merely logged in is not enough — this function
  // spends Google API quota and exposes Search Console state.
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    // Get service account key
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) {
      return new Response(JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const siteUrl = "sc-domain:agendax.co.il";
    const encodedSiteUrl = encodeURIComponent(siteUrl);

    const results = [];

    // Step 1: List currently registered sites (for debugging)
    const listRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sites = await listRes.json();

    // Step 2: Try to submit sitemaps using the site URL that the SA has access to
    // For domain properties, sitemaps must be on the same domain
    // So we use agendax.co.il URLs that reference our edge functions via robots.txt
    const sitemapUrls = [
      `https://agendax.co.il/sitemap.xml`,
      `https://agendax.co.il/news-sitemap.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      const encodedSitemapUrl = encodeURIComponent(sitemapUrl);
      const apiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps/${encodedSitemapUrl}`;

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const status = response.status;
      let body = "";
      try { body = await response.text(); } catch (_) {}

      results.push({
        sitemap: sitemapUrl,
        status,
        success: status >= 200 && status < 300,
        response: body,
      });
    }

    // Step 3: Also notify Google about recent articles via Indexing API
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // The canonical article URL is the slug (falling back to the id for the
    // rare row without one) — pinging the id URL would index the legacy path.
    const { data: recentArticles } = await supabaseAdmin
      .from("articles")
      .select("id, slug")
      .eq("is_draft", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(10);

    const indexingResults = [];
    if (recentArticles) {
      for (const article of recentArticles) {
        const url = `https://agendax.co.il/article/${encodeURIComponent(article.slug || article.id)}`;
        try {
          const indexRes = await fetch(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url, type: "URL_UPDATED" }),
            }
          );
          const indexBody = await indexRes.json();
          indexingResults.push({
            url,
            status: indexRes.status,
            success: indexRes.ok,
            response: indexBody,
          });
        } catch (e) {
          indexingResults.push({
            url,
            success: false,
            error: e instanceof Error ? e.message : "Unknown",
          });
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: results.some(r => r.success) || indexingResults.some(r => r.success),
      sitemapResults: results,
      indexingResults,
      registeredSites: sites,
      submittedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error submitting sitemap:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
