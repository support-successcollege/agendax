// Shared social-publishing plumbing: per-platform post styles, AI text
// generation, and the actual publishers that talk to each network's API.
import { callModel } from "./ingest.ts";

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
- החזר רק את הפוסט עצמו, בלי הערות.

פרטי הכתבה:
כותרת: ${article.title}
תקציר: ${article.excerpt}
קטגוריה: ${article.category}
תוכן: ${plainContent || "לא סופק"}`;

  const data = await callModel({ messages: [{ role: "user", content: prompt }], max_tokens: 800 });
  const post = (data as any).choices?.[0]?.message?.content?.trim() || "";
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

/** Facebook Page post (message + link). */
export async function publishFacebook(
  creds: Creds,
  post: { text: string; link: string },
): Promise<PublishResult> {
  need(creds, ["page_id", "access_token"], "פייסבוק");
  const resp = await fetch(`https://graph.facebook.com/v21.0/${creds.page_id}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: post.text, link: post.link, access_token: creds.access_token }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Facebook ${resp.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  return { externalId: String(data.id) };
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

  const publishResp = await fetch(`https://graph.facebook.com/v21.0/${creds.ig_user_id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: created.id, access_token: creds.access_token }),
  });
  const published = await publishResp.json();
  if (!publishResp.ok) {
    throw new Error(`Instagram publish ${publishResp.status}: ${published?.error?.message ?? JSON.stringify(published).slice(0, 200)}`);
  }
  return { externalId: String(published.id) };
}

/** X (Twitter) tweet via API v2 with an OAuth2 user token. */
export async function publishX(creds: Creds, post: { text: string }): Promise<PublishResult> {
  need(creds, ["access_token"], "X");
  const resp = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: post.text.slice(0, 280) }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`X ${resp.status}: ${data?.detail ?? data?.title ?? JSON.stringify(data).slice(0, 200)}`);
  return { externalId: String(data?.data?.id ?? "") };
}

/** LinkedIn post for a member or organization (author = URN). */
export async function publishLinkedIn(
  creds: Creds,
  post: { text: string; link: string },
): Promise<PublishResult> {
  need(creds, ["access_token", "author_urn"], "לינקדאין");
  const resp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202401",
    },
    body: JSON.stringify({
      author: creds.author_urn,
      commentary: post.text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: post.link, title: post.text.slice(0, 100) } },
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
