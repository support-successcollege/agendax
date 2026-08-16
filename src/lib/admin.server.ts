// Helpers for src/lib/admin.functions.ts
// All non-createServerFn logic lives here per project convention.

// ---------- admin-create-student ----------
export function validateCreateStudentInput(body: {
  email?: string;
  password?: string;
  full_name?: string;
  course_ids?: string[];
}) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const full_name = String(body.full_name || "").trim();
  const course_ids: string[] = Array.isArray(body.course_ids) ? body.course_ids : [];

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("אימייל לא תקין");
  }
  if (password.length < 6) {
    throw new Error("הסיסמה חייבת להיות באורך 6 תווים לפחות");
  }
  if (!full_name) {
    throw new Error("יש להזין שם מלא");
  }
  return { email, password, full_name, course_ids };
}

// ---------- submit-sitemap ----------
export function base64url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Create JWT for Google Service Account using Web Crypto (Cloudflare Workers compatible)
export async function createGoogleJWT(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
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

export async function getGoogleAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const jwt = await createGoogleJWT(serviceAccount);

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

export async function submitSitemapToGoogle(supabaseAdmin: any) {
  const serviceAccountJson = process.env["GOOGLE_SERVICE_ACCOUNT_KEY"];
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const siteUrl = "sc-domain:yznews.store";
  const encodedSiteUrl = encodeURIComponent(siteUrl);

  const results: Array<{ sitemap: string; status: number; success: boolean; response: string }> = [];

  const listRes = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const sites = await listRes.json();

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

  const { data: recentArticles } = await supabaseAdmin
    .from("articles")
    .select("id, slug")
    .eq("is_draft", false)
    .order("date", { ascending: false })
    .limit(10);

  const indexingResults: Array<{ url: string; status?: number; success: boolean; response?: any; error?: string }> = [];
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
              url: `https://yznews.store/article/${encodeURIComponent(article.slug || article.id)}`,
              type: "URL_UPDATED",
            }),
          }
        );
        const indexBody = await indexRes.json();
        indexingResults.push({
          url: `https://yznews.store/article/${encodeURIComponent(article.slug || article.id)}`,
          status: indexRes.status,
          success: indexRes.ok,
          response: indexBody,
        });
      } catch (e) {
        indexingResults.push({
          url: `https://yznews.store/article/${encodeURIComponent(article.slug || article.id)}`,
          success: false,
          error: e instanceof Error ? e.message : "Unknown",
        });
      }
    }
  }

  return {
    success: results.some((r) => r.success) || indexingResults.some((r) => r.success),
    sitemapResults: results,
    indexingResults,
    registeredSites: sites,
    submittedAt: new Date().toISOString(),
  };
}

// ---------- send-admin-notification ----------
export const ADMIN_EMAIL = "yzyns44@gmail.com";
export const SITE_URL = "https://yznews.store";
export const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export type NotificationType = "pending_comment" | "widget_form" | "newsletter";
const ALLOWED_NOTIFICATION_TYPES: NotificationType[] = ["pending_comment", "widget_form", "newsletter"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateNotificationInput(body: { type?: string; recordId?: string }): {
  type: NotificationType;
  recordId: string;
} {
  const type = body?.type;
  const recordId = body?.recordId;
  if (typeof type !== "string" || !ALLOWED_NOTIFICATION_TYPES.includes(type as NotificationType)) {
    throw new Error("Invalid notification type");
  }
  if (typeof recordId !== "string" || !UUID_RE.test(recordId)) {
    throw new Error("Invalid recordId");
  }
  return { type: type as NotificationType, recordId };
}

export function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function encodeSubject(subject: string) {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
}

export async function buildEmailFromDb(
  supabase: any,
  type: NotificationType,
  recordId: string,
): Promise<{ subject: string; html: string } | null> {
  if (type === "pending_comment") {
    const { data } = await supabase
      .from("article_comments")
      .select("author_name, author_email, content, article_id, is_approved")
      .eq("id", recordId)
      .maybeSingle();
    if (!data) return null;
    let articleTitle = "";
    if (data.article_id) {
      const { data: art } = await supabase
        .from("articles").select("title").eq("id", data.article_id).maybeSingle();
      articleTitle = art?.title || "";
    }
    return {
      subject: "תגובה חדשה ממתינה לאישור",
      html: `<div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <h2>תגובה חדשה ממתינה לאישור</h2>
        <p><b>שם:</b> ${escapeHtml(data.author_name)}</p>
        <p><b>מייל:</b> ${escapeHtml(data.author_email || "—")}</p>
        <p><b>כתבה:</b> ${escapeHtml(articleTitle || data.article_id || "")}</p>
        <p><b>תגובה:</b></p>
        <blockquote style="border-right:3px solid #ccc;padding:8px 12px;background:#f9f9f9;">${escapeHtml(data.content)}</blockquote>
        <p><a href="${SITE_URL}/admin">מעבר ללוח הניהול לאישור</a></p>
      </div>`,
    };
  }
  if (type === "widget_form") {
    const { data } = await supabase
      .from("widget_form_submissions")
      .select("widget_id, data")
      .eq("id", recordId)
      .maybeSingle();
    if (!data) return null;
    let widgetTitle = "";
    if (data.widget_id) {
      const { data: w } = await supabase
        .from("sidebar_widgets").select("title").eq("id", data.widget_id).maybeSingle();
      widgetTitle = w?.title || "";
    }
    const fields = (data.data || {}) as Record<string, unknown>;
    const rows = Object.entries(fields)
      .map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:bold;">${escapeHtml(k)}</td><td style="padding:4px 8px;">${escapeHtml(String(v))}</td></tr>`)
      .join("");
    return {
      subject: `רישום חדש בטופס${widgetTitle ? `: ${widgetTitle}` : ""}`,
      html: `<div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <h2>רישום חדש מטופס חלונית</h2>
        ${widgetTitle ? `<p><b>חלונית:</b> ${escapeHtml(widgetTitle)}</p>` : ""}
        <table style="border-collapse:collapse;">${rows}</table>
        <p><a href="${SITE_URL}/admin">מעבר ללוח הניהול</a></p>
      </div>`,
    };
  }
  // newsletter
  const { data } = await supabase
    .from("newsletter_subscribers")
    .select("full_name, email, phone, interest_category")
    .eq("id", recordId)
    .maybeSingle();
  if (!data) return null;
  return {
    subject: "נרשם/ת חדש/ה לניוזלטר",
    html: `<div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
      <h2>נרשם/ת חדש/ה לניוזלטר</h2>
      <p><b>שם מלא:</b> ${escapeHtml(data.full_name || "")}</p>
      <p><b>מייל:</b> ${escapeHtml(data.email || "")}</p>
      <p><b>טלפון:</b> ${escapeHtml(data.phone || "—")}</p>
      <p><b>קטגוריה:</b> ${escapeHtml(data.interest_category || "—")}</p>
    </div>`,
  };
}

export async function sendAdminNotificationEmail(type: NotificationType, recordId: string): Promise<void> {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const GOOGLE_MAIL_API_KEY = process.env["GOOGLE_MAIL_API_KEY"];
  if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
    throw new Error("Server not configured");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const email = await buildEmailFromDb(supabaseAdmin, type, recordId);
  if (!email) {
    throw new Error("Record not found");
  }

  const raw = [
    `To: ${ADMIN_EMAIL}`,
    `Subject: ${encodeSubject(email.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    email.html,
  ].join("\r\n");

  const gmailRes = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    },
    body: JSON.stringify({ raw: b64url(raw) }),
  });

  if (!gmailRes.ok) {
    const errText = await gmailRes.text();
    console.error("Gmail send failed", gmailRes.status, errText);
    throw new Error("Gmail send failed");
  }
}
