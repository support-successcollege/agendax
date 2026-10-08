// deno-lint-ignore-file no-explicit-any
// Comment-to-DM on Meta: the post asks readers to comment one word, and
// whoever does gets the article's link in a private message.
//
// Meta has no API for the automation rules its own Instagram app offers, so
// the rule lives in our database (social_automations) and the sending is ours:
// meta-webhook receives the comment, matches it here, and replies privately.
//
// Two platform facts shape everything below:
//   * a private reply is allowed once per comment and only within 7 days of
//     it, addressed by the comment's id rather than by the person — so nobody
//     who did not comment can be messaged, by construction;
//   * the comment payload names the media it is on, so a rule is bound to one
//     published post. Two articles may therefore ask for the same word.
import { callModelWithFallback, toolArgs } from "./ingest.ts";
import { fbPageToken } from "./social.ts";

export type AutomationPlatform = "instagram" | "facebook" | "instagram_story" | "facebook_story";

export type AutomationRow = {
  id: string;
  article_id: string;
  platform: AutomationPlatform;
  post_external_id: string | null;
  keywords: string[];
  message: string;
  public_reply: string;
  link_url: string;
  status: string;
  expires_at: string;
};

export type AutomationSettings = {
  dm_automation: boolean;
  dm_public_reply: boolean;
  dm_window_days: number;
  dm_message_template: string;
};

const DEFAULT_TEMPLATE =
  "היי! הנה הכתבה המלאה 📩\n\n{title}\n{link}\n\nאם בא לך עוד כאלה כל יום — agendax.co.il/join";

export async function loadAutomationSettings(supabase: any): Promise<AutomationSettings> {
  const { data } = await supabase
    .from("social_settings")
    .select("dm_automation, dm_public_reply, dm_window_days, dm_message_template")
    .eq("id", 1)
    .maybeSingle();
  return {
    dm_automation: data?.dm_automation ?? false,
    dm_public_reply: data?.dm_public_reply ?? true,
    dm_window_days: Number(data?.dm_window_days) || 7,
    dm_message_template: String(data?.dm_message_template || "").trim() || DEFAULT_TEMPLATE,
  };
}

// ---------------------------------------------------------------- matching

/**
 * The comparable form of a word: no niqqud, no punctuation, no emoji, one
 * space between words, lower case. A reader types "גוגל!!" or "Google?" or
 * " גוגל " and all three must hit the same rule.
 */
export function normalizeWord(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Whether a comment asks for the article. A single token has to match exactly
 * — otherwise "אין לי גוגל פליי" would trigger on a rule for "גוגל" — and a
 * longer keyword is also accepted inside a sentence, because people write
 * "רוצה את הכתבה על גוגל".
 */
export function matchesKeywords(comment: string, keywords: string[]): string | null {
  const text = normalizeWord(comment);
  if (!text) return null;
  const tokens = text.split(" ");
  for (const raw of keywords) {
    const key = normalizeWord(raw);
    if (!key) continue;
    if (tokens.includes(key)) return raw;
    if (key.length >= 4 && text.includes(key)) return raw;
  }
  return null;
}

/** The line the post itself carries. Appended in code so it is always exact. */
export const ctaLine = (keyword: string) =>
  `💬 רוצים את הכתבה המלאה? הגיבו "${keyword}" ואשלח לכם אותה בפרטי.`;

/**
 * Puts the "comment X" line into a post. Above the hashtag line when there is
 * one, because a call to action under the hashtags is read by nobody.
 */
export function withCtaLine(text: string, cta: string): string {
  const lines = text.split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (last.startsWith("#")) lines.splice(lines.length - 1, 0, "", cta, "");
  else lines.push("", cta);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Fills {title} / {link} (and tolerates a template that mentions neither). */
export function renderMessage(template: string, article: { title: string }, link: string): string {
  const filled = template.replaceAll("{title}", article.title).replaceAll("{link}", link);
  return filled.includes(link) ? filled : `${filled}\n${link}`;
}

// ---------------------------------------------------------------- keywords

const GENERIC = new Set([
  "כתבה",
  "חדשות",
  "מידע",
  "לינק",
  "קישור",
  "עוד",
  "כן",
  "מעניין",
  "ai",
  "טכנולוגיה",
]);

/**
 * The word the post will ask for: the article's subject, as a reader would
 * shout it — one word, no spaces, recognisable at a glance in a feed.
 *
 * Reused across platforms for the same article, so the Instagram post and the
 * Facebook post ask for the same thing.
 */
export async function deriveKeyword(article: { title: string; excerpt: string; category: string }): Promise<{
  keyword: string;
  aliases: string[];
}> {
  const prompt = `בחר מילת קוד אחת שקוראים יגיבו בה כדי לקבל את הכתבה בפרטי.

כללים:
- מילה אחת בלבד, בלי רווחים, 2-12 תווים.
- הנושא המזוהה ביותר בכתבה: שם חברה, מוצר, אדם או מניה (גוגל, אנבידיה, אפל, ביטקוין, טסלה).
- בעברית, כפי שישראלי היה מקליד אותה.
- לא מילה כללית כמו "כתבה", "חדשות", "מידע", "לינק", "AI".
- aliases: איך עוד אותה מילה נכתבת — אנגלית, כתיב חלופי, בלי רווח. 1-4 פריטים.

כותרת: ${article.title}
תקציר: ${article.excerpt}
קטגוריה: ${article.category}`;

  const data = await callModelWithFallback({
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "pick_keyword",
          description: "מחזיר את מילת הקוד לתגובה",
          parameters: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "מילה אחת בעברית, בלי רווחים" },
              aliases: { type: "array", items: { type: "string" }, description: "כתיבים חלופיים" },
            },
            required: ["keyword", "aliases"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "pick_keyword" } },
  });

  const args = toolArgs(data as any) as { keyword?: string; aliases?: unknown };
  // A keyword with a space in it cannot be "comment this word", and a generic
  // one would collide with every other post's rule in the reader's head.
  const keyword = String(args.keyword ?? "").trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, "");
  if (!keyword || keyword.length < 2 || keyword.length > 14 || GENERIC.has(normalizeWord(keyword))) {
    throw new Error(`המודל לא החזיר מילת קוד שימושית (${keyword || "ריק"})`);
  }
  const aliases = Array.isArray(args.aliases)
    ? args.aliases
      .map((a) => String(a).trim().replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((a) => a.length >= 2 && a.length <= 20 && normalizeWord(a) !== normalizeWord(keyword))
      .slice(0, 4)
    : [];
  return { keyword, aliases };
}

// ------------------------------------------------------------------ arming

/**
 * Records the rule for a post that is now live. Upsert on (platform,
 * post_external_id): re-publishing the same article to the same network
 * replaces its rule instead of leaving two that answer the same comments.
 */
export async function armAutomation(
  supabase: any,
  rule: {
    articleId: string;
    platform: AutomationPlatform;
    postExternalId: string;
    keywords: string[];
    link: string;
    settings: AutomationSettings;
  },
): Promise<void> {
  const expires = new Date(Date.now() + rule.settings.dm_window_days * 86_400_000).toISOString();
  const { error } = await supabase.from("social_automations").upsert(
    {
      article_id: rule.articleId,
      platform: rule.platform,
      post_external_id: rule.postExternalId,
      keywords: rule.keywords,
      message: rule.settings.dm_message_template,
      public_reply: rule.settings.dm_public_reply ? "שלחתי לך את הכתבה בפרטי 📩" : "",
      link_url: rule.link,
      status: "active",
      expires_at: expires,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform,post_external_id" },
  );
  if (error) throw new Error(`שמירת האוטומציה נכשלה: ${error.message}`);
}

/**
 * The keyword to use for an article, and the line to add to the post — or null
 * when the feature is off or the model could not produce a usable word (in
 * which case the post goes out as it always did, without a promise we cannot
 * keep).
 */
export async function planAutomation(
  supabase: any,
  article: { id: string; title: string; excerpt: string; category: string },
  settings: AutomationSettings,
  opts: { reuseOnly?: boolean } = {},
): Promise<{ keywords: string[]; cta: string } | null> {
  if (!settings.dm_automation) return null;

  // An earlier platform already chose a word for this article: both posts ask
  // for the same one.
  const { data: existing } = await supabase
    .from("social_automations")
    .select("keywords")
    .eq("article_id", article.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const reused: string[] = Array.isArray(existing?.keywords) ? existing.keywords : [];
  if (reused.length > 0) return { keywords: reused, cta: ctaLine(reused[0]) };
  // A story carries a rendered image, so it cannot ask for a word of its own:
  // it only listens for the word its article's post already asked for.
  if (opts.reuseOnly) return null;

  try {
    const { keyword, aliases } = await deriveKeyword(article);
    return { keywords: [keyword, ...aliases], cta: ctaLine(keyword) };
  } catch (e) {
    console.error("DM automation: no keyword, posting without the CTA:", (e as Error).message);
    return null;
  }
}

// ------------------------------------------------------------------ replies

/**
 * The private reply. Addressed to the comment, which is how Meta scopes it:
 * only the person who wrote that comment can receive it, once, inside the
 * seven-day window.
 */
export async function sendPrivateReply(
  platform: "instagram" | "facebook",
  creds: Record<string, string>,
  commentId: string,
  text: string,
): Promise<string> {
  const token = await fbPageToken(creds);

  // Instagram messaging has been documented on two different nodes — the
  // Instagram account and the page it is connected to — and which one an app
  // may use depends on how its Instagram product was set up. Both are tried,
  // because the refusal is the same opaque "(#3) does not have the capability"
  // either way and only an attempt tells them apart.
  const nodes = platform === "instagram"
    ? [creds.ig_user_id, creds.page_id].filter(Boolean)
    : [creds.page_id].filter(Boolean);
  if (nodes.length === 0) throw new Error(`חסר מזהה חשבון ל${platform}`);

  const failures: string[] = [];
  for (const id of nodes) {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
        ...(platform === "facebook" ? { messaging_type: "RESPONSE" } : {}),
        access_token: token,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return String(data?.message_id ?? data?.id ?? "");
    failures.push(`${id}: ${resp.status} ${data?.error?.message ?? JSON.stringify(data).slice(0, 150)}`);
  }
  throw new Error(`private reply — ${failures.join(" | ")}`);
}

/**
 * A DM to someone who messaged us (an Instagram story reply arrives as a
 * message, not as a comment, so it is answered on the open conversation).
 */
export async function sendDirectMessage(
  platform: "instagram" | "facebook",
  creds: Record<string, string>,
  recipientId: string,
  text: string,
): Promise<string> {
  const id = platform === "instagram" ? creds.ig_user_id : creds.page_id;
  if (!id) throw new Error(`חסר מזהה חשבון ל${platform}`);
  const token = platform === "facebook" ? await fbPageToken(creds) : creds.access_token;

  const resp = await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
      access_token: token,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`direct message ${resp.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  return String(data?.message_id ?? data?.id ?? "");
}

/**
 * The public answer under the comment. Not essential to the reader who gets
 * the DM — it is for the next reader, who sees that commenting works. A
 * failure here never fails the private reply.
 */
export async function sendPublicReply(
  platform: "instagram" | "facebook",
  creds: Record<string, string>,
  commentId: string,
  text: string,
): Promise<void> {
  const token = platform === "facebook" ? await fbPageToken(creds) : creds.access_token;
  const edge = platform === "instagram" ? "replies" : "comments";
  const resp = await fetch(`https://graph.facebook.com/v21.0/${commentId}/${edge}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(`public reply ${resp.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 150)}`);
  }
}
