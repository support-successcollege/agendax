// deno-lint-ignore-file no-explicit-any
// Meta's webhook: where a comment on our Instagram or Facebook post becomes a
// private message with the article's link.
//
// Public on purpose — Meta calls it, so it is deployed with --no-verify-jwt
// and has no bearer token to present. Two things stand in for that:
//   * GET answers the subscription handshake only when hub.verify_token
//     matches META_VERIFY_TOKEN;
//   * POST is rejected unless X-Hub-Signature-256 is the HMAC-SHA256 of the
//     exact body under META_APP_SECRET. Without the secret configured nothing
//     is processed at all, rather than processing everything.
//
// Every delivery is written to social_automation_events keyed by the comment's
// id before anything is sent. Meta retries a delivery it did not see
// acknowledged, and that single unique key is what keeps one comment from
// producing two DMs.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { getSecret } from "../_shared/secrets.ts";
import {
  type AutomationRow,
  renderMessage,
  sendDirectMessage,
  sendPrivateReply,
  sendPublicReply,
} from "../_shared/dmAutomation.ts";
import { extractEvents, findAutomation, type Incoming, type Network, signatureIsValid } from "../_shared/metaEvents.ts";

async function handleEvent(
  supabase: any,
  event: Incoming,
  rules: AutomationRow[],
  accounts: Record<Network, Record<string, string> | undefined>,
  titles: Map<string, string>,
): Promise<string> {
  // The ledger row is the lock. Taken before any match or send, so a retried
  // delivery stops here instead of messaging the person a second time.
  const { error: claimError } = await supabase.from("social_automation_events").insert({
    comment_id: event.eventId,
    platform: event.network,
    sender_id: event.senderId,
    comment_text: event.text.slice(0, 500),
  });
  if (claimError) {
    // 23505 = already handled, which is the normal case for a retry.
    if (claimError.code === "23505") return "duplicate";
    console.error("automation ledger insert failed", claimError.message);
    return "ledger-failed";
  }

  const finish = async (patch: Record<string, unknown>) =>
    await supabase.from("social_automation_events").update(patch).eq("comment_id", event.eventId);

  const hit = findAutomation(rules, event);
  if (!hit) {
    await finish({ matched: false });
    return "no-match";
  }

  const creds = accounts[event.network];
  if (!creds) {
    await finish({ matched: true, automation_id: hit.rule.id, error: "החשבון אינו מחובר או כבוי" });
    return "no-account";
  }

  const title = titles.get(hit.rule.article_id) ?? "";
  const text = renderMessage(hit.rule.message, { title }, hit.rule.link_url);

  try {
    if (event.kind === "comment") {
      await sendPrivateReply(event.network, creds, event.eventId, text);
    } else {
      await sendDirectMessage(event.network, creds, event.senderId, text);
    }
    await finish({ matched: true, sent: true, automation_id: hit.rule.id });
    await supabase.rpc("bump_automation", { p_id: hit.rule.id, p_sent: true });

    // Only under a comment, and only when the rule carries one. A failure here
    // is logged and nothing more: the reader already has the article.
    if (event.kind === "comment" && hit.rule.public_reply) {
      try {
        await sendPublicReply(event.network, creds, event.eventId, hit.rule.public_reply);
      } catch (e) {
        console.error("public reply failed (DM is out):", (e as Error).message);
      }
    }
    return "sent";
  } catch (e) {
    const message = (e as Error).message;
    console.error(`DM failed for ${event.eventId}:`, message);
    await finish({ matched: true, sent: false, automation_id: hit.rule.id, error: message.slice(0, 500) });
    await supabase.rpc("bump_automation", { p_id: hit.rule.id, p_sent: false });
    return "send-failed";
  }
}

serve(async (req) => {
  const url = new URL(req.url);

  // ---------- the subscription handshake ----------
  if (req.method === "GET") {
    const verifyToken = await getSecret("META_VERIFY_TOKEN");
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (!verifyToken) return new Response("verify token not configured", { status: 503 });
    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const body = await req.text();
  const appSecret = await getSecret("META_APP_SECRET");
  if (!appSecret) {
    console.error("meta-webhook: META_APP_SECRET is not set — delivery dropped unverified");
    return new Response("not configured", { status: 503 });
  }
  if (!(await signatureIsValid(body, req.headers.get("x-hub-signature-256"), appSecret))) {
    return new Response("bad signature", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = JSON.parse(body);

    const { data: accountRows } = await supabase
      .from("social_accounts")
      .select("platform, credentials")
      .eq("enabled", true)
      .in("platform", ["instagram", "facebook"]);
    const accounts: Record<Network, Record<string, string> | undefined> = {
      instagram: undefined,
      facebook: undefined,
    };
    const ourIds = new Set<string>();
    for (const row of (accountRows ?? []) as any[]) {
      const creds = (row.credentials ?? {}) as Record<string, string>;
      accounts[row.platform as Network] = creds;
      for (const id of [creds.ig_user_id, creds.page_id]) if (id) ourIds.add(String(id));
    }

    // Instagram is reached through the page it is connected to, and the page's
    // id lives on the Facebook row. Without it an Instagram send has only one
    // node to try, and the other one is the node Meta may actually allow.
    if (accounts.instagram && accounts.facebook?.page_id && !accounts.instagram.page_id) {
      accounts.instagram = { ...accounts.instagram, page_id: accounts.facebook.page_id };
    }

    const events = extractEvents(payload, ourIds);
    if (events.length === 0) return new Response("ok", { status: 200 });

    const { data: ruleRows } = await supabase
      .from("social_automations")
      .select("id, article_id, platform, post_external_id, keywords, message, public_reply, link_url, status, expires_at")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    const rules = (ruleRows ?? []) as AutomationRow[];

    const titles = new Map<string, string>();
    if (rules.length > 0) {
      const { data: articles } = await supabase
        .from("articles")
        .select("id, title")
        .in("id", [...new Set(rules.map((r) => r.article_id))]);
      for (const a of (articles ?? []) as any[]) titles.set(a.id, a.title);
    }

    // A delivery can carry a batch; the cap keeps one request inside the
    // runtime's budget, and anything beyond it comes back on Meta's retry.
    const outcomes: string[] = [];
    for (const event of events.slice(0, 20)) {
      outcomes.push(await handleEvent(supabase, event, rules, accounts, titles));
    }
    console.log(`meta-webhook: ${outcomes.join(", ")}`);
  } catch (e) {
    // Never 500 at Meta: a non-200 makes it retry the whole delivery, and the
    // ledger has already recorded whatever we managed to do.
    console.error("meta-webhook error", (e as Error).message);
  }

  return new Response("ok", { status: 200 });
});
