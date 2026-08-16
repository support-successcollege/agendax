import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const siteUrl = "sc-domain:yznews.store";
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
    // So we use yznews.store URLs that reference our edge functions via robots.txt
    const sitemapUrls = [
      `https://yznews.store/sitemap.xml`,
      `https://yznews.store/news-sitemap.xml`,
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

    const { data: recentArticles } = await supabaseAdmin
      .from("articles")
      .select("id")
      .eq("is_draft", false)
      .order("date", { ascending: false })
      .limit(10);

    const indexingResults = [];
    if (recentArticles) {
      for (const article of recentArticles) {
        try {
          const indexRes = await fetch(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: `https://yznews.store/article/${article.id}`,
                type: "URL_UPDATED",
              }),
            }
          );
          const indexBody = await indexRes.json();
          indexingResults.push({
            url: `https://yznews.store/article/${article.id}`,
            status: indexRes.status,
            success: indexRes.ok,
            response: indexBody,
          });
        } catch (e) {
          indexingResults.push({
            url: `https://yznews.store/article/${article.id}`,
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
