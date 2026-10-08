// deno-lint-ignore-file no-explicit-any
// Reading Meta's webhook deliveries: is this really from Meta, and what in it
// is a reader asking us for an article?
//
// Separate from the function that serves the endpoint so both questions can be
// answered against recorded payloads without a live delivery — the shapes
// below are the ones Meta actually sends, and getting them wrong fails
// silently (an unrecognised event is simply never answered).
import { type AutomationRow, matchesKeywords } from "./dmAutomation.ts";

export type Network = "instagram" | "facebook";

/** A comment or a message, reduced to what the matcher needs. */
export type Incoming = {
  network: Network;
  /** Dedupe key: the comment id, or the message id for a DM. */
  eventId: string;
  senderId: string;
  text: string;
  /** The media/post the comment sits on; a story id for a story reply. */
  mediaId: string | null;
  /** A comment can be answered privately; a DM is answered on the thread. */
  kind: "comment" | "message";
};

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Constant-time compare, so a wrong signature leaks nothing by timing. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * X-Hub-Signature-256 against the body exactly as it arrived. The raw text
 * has to be used — re-serialising the parsed JSON changes bytes and the
 * signature stops matching.
 */
export async function signatureIsValid(
  body: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return sameSignature(header.slice(7).toLowerCase(), hex(mac));
}

/**
 * Pulls the comments and messages out of a delivery. Everything else Meta may
 * send (likes, edits, our own echoes, a comment we posted ourselves) is
 * dropped here rather than filtered later.
 */
export function extractEvents(payload: any, ourIds: Set<string>): Incoming[] {
  const out: Incoming[] = [];
  const object = String(payload?.object ?? "");
  const network: Network | null = object === "instagram"
    ? "instagram"
    : object === "page"
    ? "facebook"
    : null;
  if (!network) return out;

  for (const entry of (payload?.entry ?? []) as any[]) {
    // ---- comments
    for (const change of (entry?.changes ?? []) as any[]) {
      const value = change?.value ?? {};
      const field = String(change?.field ?? "");
      if (network === "instagram" && field !== "comments") continue;
      if (network === "facebook" && field !== "feed") continue;
      // The page's feed delivery carries likes, shares, edits and posts too.
      if (network === "facebook" && (value.item !== "comment" || value.verb !== "add")) continue;

      const senderId = String(value?.from?.id ?? "");
      // Our own comment — including the public reply the webhook itself posts.
      if (!senderId || ourIds.has(senderId)) continue;

      const eventId = String(value?.id ?? value?.comment_id ?? "");
      const text = String(value?.text ?? value?.message ?? "");
      const mediaId = String(value?.media?.id ?? value?.post_id ?? "") || null;
      if (eventId && text) out.push({ network, eventId, senderId, text, mediaId, kind: "comment" });
    }

    // ---- messages (an Instagram story reply arrives here, not as a comment)
    for (const event of (entry?.messaging ?? []) as any[]) {
      const message = event?.message;
      if (!message || message.is_echo) continue;
      const senderId = String(event?.sender?.id ?? "");
      if (!senderId || ourIds.has(senderId)) continue;
      const text = String(message?.text ?? "");
      const eventId = String(message?.mid ?? "");
      const storyId = String(message?.reply_to?.story?.id ?? "") || null;
      if (eventId && text) {
        out.push({ network, eventId, senderId, text, mediaId: storyId, kind: "message" });
      }
    }
  }
  return out;
}

/**
 * Facebook names a post "{page-id}_{post-id}" in some places and "{post-id}"
 * in others, and which form we stored depends on which endpoint published it.
 * Comparing the trailing id covers both without matching unrelated posts.
 */
export const sameMedia = (a: string, b: string) => {
  if (a === b) return true;
  const tail = (s: string) => s.split("_").pop() ?? s;
  return tail(a) === tail(b);
};

/**
 * The rule this text should trigger. The post the comment sits on is the first
 * filter — a rule answers comments on its own post only — and the keyword is
 * the second. A story reply or a plain DM has no post to anchor to, so there
 * the keyword alone decides, newest rule first.
 */
export function findAutomation(
  rules: AutomationRow[],
  event: Incoming,
): { rule: AutomationRow; keyword: string } | null {
  const live = rules.filter((r) => r.platform.startsWith(event.network));

  if (event.mediaId) {
    for (const rule of live) {
      if (!rule.post_external_id || !sameMedia(rule.post_external_id, event.mediaId)) continue;
      const keyword = matchesKeywords(event.text, rule.keywords);
      if (keyword) return { rule, keyword };
    }
    // A comment on one of our posts that carries another post's keyword is not
    // served: the reader would get a link to something they were not reading.
    if (event.kind === "comment") return null;
  }

  for (const rule of live) {
    const keyword = matchesKeywords(event.text, rule.keywords);
    if (keyword) return { rule, keyword };
  }
  return null;
}
