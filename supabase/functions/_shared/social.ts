// Shared social-publishing plumbing: per-platform post styles, AI text
// generation, and the actual publishers that talk to each network's API.
import { callModel, toolArgs } from "./ingest.ts";

export const SITE_URL = "https://agendax.co.il";

export const PLATFORM_STYLE: Record<string, string> = {
  facebook: "פוסט פייסבוק: 4-5 משפטים מעמיקים, אמוג'ים במידה, קריאה לפעולה.",
  linkedin: "פוסט לינקדאין: טון מקצועי-עסקי, 4-6 משפטים, בלי סלנג, אמוג'ים מעטים.",
  x: "פוסט X (טוויטר): עד 240 תווים לפני הלינק, חד ומסקרן.",
  twitter: "פוסט X (טוויטר): עד 240 תווים לפני הלינק, חד ומסקרן.",
  instagram: "כיתוב אינסטגרם: 3-4 משפטים קליטים, אמוג'ים, שורת האשטגים עשירה. בלי לינק בגוף הטקסט (אינסטגרם לא מקשר) — כתוב \"הלינק בביו\" או הפנה לאתר בשם.",
  whatsapp: "הודעת וואטסאפ לערוץ: 2-3 משפטים ישירים, אמוג'י פותח, בלי האשטגים.",
};

export type ArticleForPost = {
  title: string;
  excerpt: string;
  category: string;
  content: string;
  url: string;
};

/** Generates the post text for one platform. */
export async function generatePostText(article: ArticleForPost, platform: string): Promise<string> {
  const style = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.facebook;
  const includeLink = platform !== "instagram";
  const wantHashtags = platform !== "whatsapp";
  const plainContent = article.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000);

  const prompt = `אתה כותב תוכן לרשתות חברתיות עבור Agendax, אתר ישראלי המסקר הייטק, בינה מלאכותית, שוקי הון וחברות.

${style}

כללים:
- כתוב בעברית. אל תתייחס לתמונה. אל תמציא עובדות שלא בפרטי הכתבה.
${includeLink ? `- סיים עם: 📖 לכתבה המלאה: ${article.url}` : ""}
${wantHashtags ? "- שורה אחרונה: לפחות 4 האשטגים בעברית." : "- בלי האשטגים."}
- **החזר אך ורק את הפוסט הסופי.** בלי טיוטות, בלי ספירת תווים, בלי "Draft", בלי הערות או הסברים — כל תו שתחזיר יפורסם כלשונו.

פרטי הכתבה:
כותרת: ${article.title}
תקציר: ${article.excerpt}
קטגוריה: ${article.category}
תוכן: ${plainContent || "לא סופק"}`;

  // Forced tool call, not free text: two live tweets went out with leaked
  // meta ("char count for Draft 1:", a post starting mid-word) when the model
  // narrated around its answer. A structured field cannot carry narration.
  const data = await callModel({
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "write_post",
          description: "מחזיר את הפוסט הסופי לפרסום",
          parameters: {
            type: "object",
            properties: {
              post: { type: "string", description: "הפוסט המלא, מוכן לפרסום כלשונו" },
            },
            required: ["post"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "write_post" } },
  });
  const post = String((toolArgs(data as any) as { post?: string }).post ?? "").trim();
  if (!post) throw new Error("המודל לא החזיר טקסט לפוסט");
  return post;
}

export type PublishResult = { externalId: string };
type Creds = Record<string, string>;

const need = (creds: Creds, keys: string[], platform: string) => {
  for (const k of keys) {
    if (!creds[k]) throw new Error(`חסר שדה ${k} בהגדרות ${platform}`);
  }
};

/**
 * Resolves the PAGE access token: whichever token the admin pasted — a user
 * token with pages_manage_posts, or the page token itself — asking the page
 * for its own access_token returns the page token in both cases. Posting
 * always uses the result, so the panel accepts either without ceremony.
 */
async function fbPageToken(creds: Creds): Promise<string> {
  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${creds.page_id}?fields=access_token&access_token=${encodeURIComponent(creds.access_token)}`,
  );
  const data = await resp.json();
  if (resp.ok && data?.access_token) return String(data.access_token);
  // No exchange available (missing permission?) — try the stored token as-is.
  return creds.access_token;
}

/**
 * Facebook Page post. With imageUrl: a photo post — the branded PNG up front,
 * the text (which already carries the article link) as its caption. Without:
 * a plain feed post with a link card.
 */
export async function publishFacebook(
  creds: Creds,
  post: { text: string; link: string; imageUrl?: string },
): Promise<PublishResult> {
  need(creds, ["page_id", "access_token"], "פייסבוק");
  const pageToken = await fbPageToken(creds);
  const endpoint = post.imageUrl ? "photos" : "feed";
  const body = post.imageUrl
    ? { url: post.imageUrl, message: post.text, access_token: pageToken }
    : { message: post.text, link: post.link, access_token: pageToken };
  const resp = await fetch(`https://graph.facebook.com/v21.0/${creds.page_id}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Facebook ${resp.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  return { externalId: String(data.post_id ?? data.id) };
}

/** Instagram Business photo post: media container → publish. */
export async function publishInstagram(
  creds: Creds,
  post: { caption: string; imageUrl: string },
): Promise<PublishResult> {
  need(creds, ["ig_user_id", "access_token"], "אינסטגרם");
  if (!post.imageUrl) throw new Error("לכתבה אין תמונה — אינסטגרם דורש תמונה");

  const createResp = await fetch(`https://graph.facebook.com/v21.0/${creds.ig_user_id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: post.imageUrl,
      caption: post.caption,
      access_token: creds.access_token,
    }),
  });
  const created = await createResp.json();
  if (!createResp.ok) {
    throw new Error(`Instagram media ${createResp.status}: ${created?.error?.message ?? JSON.stringify(created).slice(0, 200)}`);
  }

  // The container processes the image asynchronously; publishing before it
  // reaches FINISHED fails with "Media ID is not available". Poll first.
  for (let i = 0; i < 10; i++) {
    const statusResp = await fetch(
      `https://graph.facebook.com/v21.0/${created.id}?fields=status_code&access_token=${encodeURIComponent(creds.access_token)}`,
    );
    const status = await statusResp.json().catch(() => ({}));
    if (status?.status_code === "FINISHED") break;
    if (status?.status_code === "ERROR") {
      throw new Error(`Instagram container ERROR: ${JSON.stringify(status).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  let published: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const publishResp = await fetch(`https://graph.facebook.com/v21.0/${creds.ig_user_id}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: created.id, access_token: creds.access_token }),
    });
    published = await publishResp.json();
    if (publishResp.ok) return { externalId: String(published.id) };
    const message = String(published?.error?.message ?? "");
    // Still processing — wait and retry; anything else is a real failure.
    if (!message.includes("Media ID is not available")) {
      throw new Error(`Instagram publish ${publishResp.status}: ${message || JSON.stringify(published).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Instagram publish: ${published?.error?.message ?? "המדיה לא סיימה עיבוד בזמן"}`);
}

// ---------------------------------------------------------------------------
// X (Twitter)
// ---------------------------------------------------------------------------
// Preferred auth: OAuth 1.0a user context — four keys copied straight from the
// developer portal (Consumer Keys + Access Token & Secret), which never
// expire. An OAuth2 *user* bearer token also works as a fallback, but the
// portal's easy-to-grab App-Only bearer does NOT (posting is forbidden with
// application context — the exact mistake this dual path exists to absorb).

const pctEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** OAuth 1.0a Authorization header for a JSON-body request (no body params). */
async function oauth1Header(method: string, url: string, creds: Creds): Promise<string> {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.api_key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.access_token,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join("&");
  const base = [method.toUpperCase(), pctEncode(url), pctEncode(paramString)].join("&");
  const signingKey = `${pctEncode(creds.api_secret)}&${pctEncode(creds.access_secret)}`;
  params.oauth_signature = await hmacSha1Base64(signingKey, base);
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(params[k])}"`)
      .join(", ")
  );
}

/**
 * Fits a tweet into X's 280 weighted characters: every URL counts as 23
 * (t.co wraps it), so a percent-encoded Hebrew slug of 250 characters is
 * fine — and a naive slice(0,280) would cut it mid-encoding and break the
 * link (which is exactly what it did). Only the opening text is trimmed.
 */
function fitTweet(text: string): string {
  const urlRegex = /https?:\/\/\S+/g;
  const weight = (s: string) =>
    [...s.replace(urlRegex, "")].length + (s.match(urlRegex)?.length ?? 0) * 23;
  if (weight(text) <= 280) return text;

  const lines = text.split("\n");
  const firstUrlLine = lines.findIndex((l) => /https?:\/\//.test(l));
  if (firstUrlLine === -1) return [...text].slice(0, 279).join("").trimEnd() + "…";

  const tail = lines.slice(firstUrlLine).join("\n");
  let head = lines.slice(0, firstUrlLine).join("\n").trimEnd();
  const budget = 280 - weight(tail) - 1; // the joining newline
  if (budget < 20) return tail; // pathological: keep the link, drop the copy
  if ([...head].length > budget) {
    head = [...head].slice(0, budget - 1).join("").trimEnd() + "…";
  }
  return `${head}\n${tail}`;
}

const hasOauth1 = (creds: Creds) =>
  !!(creds.api_key && creds.api_secret && creds.access_token && creds.access_secret);

/**
 * Uploads an image to X (v1.1 media/upload, the only media door) and returns
 * its media id. OAuth 1.0a only — multipart bodies are excluded from the
 * signature base, so the same header builder works.
 */
async function uploadXMedia(creds: Creds, imageUrl: string): Promise<string> {
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`הורדת התמונה נכשלה: HTTP ${imgResp.status}`);
  const mime = (imgResp.headers.get("content-type") || "").split(";")[0].trim();
  if (!mime.startsWith("image/")) throw new Error(`הקובץ אינו תמונה (${mime})`);
  const bytes = new Uint8Array(await imgResp.arrayBuffer());
  if (bytes.length > 5_000_000) throw new Error("התמונה גדולה מ-5MB — מעל מגבלת X");

  const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: mime }));

  const resp = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: await oauth1Header("POST", uploadUrl, creds) },
    body: form,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`X media ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const mediaId = String(data.media_id_string ?? data.media_id ?? "");
  if (!mediaId) throw new Error("X לא החזיר מזהה מדיה");
  return mediaId;
}

export async function publishX(
  creds: Creds,
  post: { text: string; imageUrl?: string | null },
): Promise<PublishResult> {
  const url = "https://api.x.com/2/tweets";
  let authHeader: string;

  if (hasOauth1(creds)) {
    authHeader = await oauth1Header("POST", url, creds);
  } else if (creds.access_token) {
    authHeader = `Bearer ${creds.access_token}`;
  } else {
    throw new Error("חסרים מפתחות X: נדרשים API Key + API Secret + Access Token + Access Secret");
  }

  // The image rides along when it can; a failed upload never blocks the
  // tweet — text with a working link beats nothing.
  const body: Record<string, unknown> = { text: fitTweet(post.text) };
  if (post.imageUrl && hasOauth1(creds)) {
    try {
      const mediaId = await uploadXMedia(creds, post.imageUrl);
      body.media = { media_ids: [mediaId] };
    } catch (e) {
      console.error("X media upload failed, tweeting without image:", (e as Error).message);
    }
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const detail = data?.detail ?? data?.title ?? JSON.stringify(data).slice(0, 200);
    if (String(detail).includes("Application-Only")) {
      throw new Error(
        "X דחה את הטוקן: זהו Bearer של האפליקציה (קריאה בלבד). יש להזין את ארבעת המפתחות: API Key, API Secret, Access Token, Access Secret",
      );
    }
    throw new Error(`X ${resp.status}: ${detail}`);
  }
  return { externalId: String(data?.data?.id ?? "") };
}

// Must be a currently-active version — LinkedIn sunsets them after ~a year
// and answers 426 NONEXISTENT_VERSION once it lapses.
const LI_VERSION = "202601";

const liHeaders = (creds: Creds) => ({
  Authorization: `Bearer ${creds.access_token}`,
  "Content-Type": "application/json",
  "X-Restli-Protocol-Version": "2.0.0",
  "LinkedIn-Version": LI_VERSION,
});

/**
 * Uploads an image to LinkedIn's asset store and returns its urn:li:image id:
 * initializeUpload hands back a one-time PUT URL, the binary goes there.
 */
async function uploadLinkedInImage(creds: Creds, imageUrl: string): Promise<string> {
  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: liHeaders(creds),
    body: JSON.stringify({ initializeUploadRequest: { owner: creds.author_urn } }),
  });
  const initData = await init.json();
  if (!init.ok) throw new Error(`LinkedIn image init ${init.status}: ${JSON.stringify(initData).slice(0, 200)}`);
  const uploadUrl: string = initData?.value?.uploadUrl;
  const imageUrn: string = initData?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn לא החזיר כתובת העלאה לתמונה");

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`הורדת התמונה נכשלה: HTTP ${imgResp.status}`);
  const bytes = new Uint8Array(await imgResp.arrayBuffer());

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${creds.access_token}` },
    body: bytes,
  });
  if (!put.ok) throw new Error(`LinkedIn image upload ${put.status}`);
  return imageUrn;
}

/**
 * LinkedIn post for a member or organization (author = URN). With imageUrl the
 * branded PNG leads the post (the article link stays in the text); a failed
 * upload falls back to the plain article link card — a post without our
 * template beats no post.
 */
export async function publishLinkedIn(
  creds: Creds,
  post: { text: string; link: string; imageUrl?: string },
): Promise<PublishResult> {
  need(creds, ["access_token", "author_urn"], "לינקדאין");

  let content: Record<string, unknown> = {
    article: { source: post.link, title: post.text.slice(0, 100) },
  };
  if (post.imageUrl) {
    try {
      const imageUrn = await uploadLinkedInImage(creds, post.imageUrl);
      content = { media: { id: imageUrn, altText: post.text.slice(0, 100) } };
    } catch (e) {
      console.error("LinkedIn image upload failed, posting link card instead:", (e as Error).message);
    }
  }

  const resp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: liHeaders(creds),
    body: JSON.stringify({
      author: creds.author_urn,
      commentary: post.text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content,
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LinkedIn ${resp.status}: ${t.slice(0, 250)}`);
  }
  const externalId = resp.headers.get("x-restli-id") ?? "";
  return { externalId };
}
