// deno-lint-ignore-file no-explicit-any
// The admin side of the comment-to-DM automation: connect the webhook, see
// whether it is really connected, and try a keyword without messaging anyone.
//
// The rules themselves are read and edited straight from the panel (RLS lets
// an admin at social_automations). What needs a server is here, because it
// needs the page token or the app secret, and neither may reach a browser.
//
// Actions:
//   { action: "check" }      — is the page subscribed, which fields, are the
//                              two webhook secrets set (yes/no, never values)
//   { action: "subscribe" }  — subscribe our app to the page's comments and
//                              messages (the half of the setup that has an API)
//   { action: "test", text } — which rule and word this comment would hit;
//                              sends nothing
//   { action: "profile", senderId }
//                            — what Meta will tell us about a commenter,
//                              including whether they follow the account
//   { action: "exchangeToken", userToken }
//                            — turns a short-lived user token from the Graph
//                              API Explorer into a page token that does not
//                              expire, and stores it for both networks
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";
import { getSecret } from "../_shared/secrets.ts";
import { fbPageToken } from "../_shared/social.ts";
import { type AutomationRow, matchesKeywords } from "../_shared/dmAutomation.ts";

/** Comments and story/DM replies — the two deliveries this feature lives on. */
const FIELDS = "feed,messages";

/**
 * What the app must be subscribed to per object. Registering the callback URL
 * is not enough and looks identical in the dashboard: an object with no fields
 * ticked is live, verified, and silent. This is the list that makes it speak.
 */
const OBJECT_FIELDS: Record<string, string> = {
  page: "feed,messages",
  instagram: "comments,messages",
};

const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/meta-webhook`;

async function loadAccounts(supabase: any) {
  const { data } = await supabase
    .from("social_accounts")
    .select("platform, enabled, credentials")
    .in("platform", ["facebook", "instagram"]);
  const map: Record<string, { enabled: boolean; credentials: Record<string, string> }> = {};
  for (const row of (data ?? []) as any[]) {
    map[row.platform] = { enabled: !!row.enabled, credentials: (row.credentials ?? {}) as Record<string, string> };
  }
  return map;
}

/**
 * What the app itself is subscribed to, per object — read with an app access
 * token (app id + app secret), which is the only credential that can see it.
 * Returns the callback URL Meta holds for each object too, so a URL that was
 * saved for one object and not another shows up as what it is.
 */
async function readAppSubscriptions(facebook: Record<string, string>): Promise<Record<string, unknown>> {
  const appSecret = await getSecret("META_APP_SECRET");
  if (!appSecret || !facebook.access_token) return { appSubscriptions: null };
  try {
    const token = await fbPageToken(facebook);
    // The token names its own app, so the id never has to be typed anywhere.
    const appResp = await fetch(
      `https://graph.facebook.com/v21.0/app?access_token=${encodeURIComponent(token)}`,
    );
    const app = await appResp.json();
    if (!appResp.ok || !app?.id) {
      throw new Error(app?.error?.message ?? `HTTP ${appResp.status}`);
    }
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${app.id}/subscriptions?access_token=${encodeURIComponent(`${app.id}|${appSecret}`)}`,
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
    const objects: Record<string, { fields: string[]; callbackUrl: string; active: boolean }> = {};
    for (const row of (data?.data ?? []) as any[]) {
      objects[String(row.object)] = {
        fields: ((row.fields ?? []) as any[]).map((f) => String(f?.name ?? f)),
        callbackUrl: String(row.callback_url ?? ""),
        active: row.active !== false,
      };
    }
    return { appId: String(app.id), appSubscriptions: objects };
  } catch (e) {
    return { appSubscriptions: null, appSubscriptionsError: (e as Error).message };
  }
}

/**
 * Subscribes the app itself to an object's fields. Meta re-runs the callback
 * handshake on every write, so the verify token is required here even though
 * the URL is already registered — which is why this can only be done by the
 * server, where both secrets live.
 */
async function subscribeAppToObject(
  appId: string,
  appSecret: string,
  verifyToken: string,
  object: string,
): Promise<{ object: string; ok: boolean; fields: string; error?: string }> {
  const fields = OBJECT_FIELDS[object];
  const body = new URLSearchParams({
    object,
    callback_url: WEBHOOK_URL,
    fields,
    verify_token: verifyToken,
    include_values: "true",
    access_token: `${appId}|${appSecret}`,
  });
  const resp = await fetch(`https://graph.facebook.com/v21.0/${appId}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { object, ok: false, fields, error: data?.error?.message ?? `HTTP ${resp.status}` };
  }
  return { object, ok: true, fields };
}

/**
 * Which permissions the stored token actually carries — names only, never the
 * token. "(#3) Application does not have the capability" is the same message
 * whether a permission was never granted, was granted to a different token, or
 * needs App Review, and this is the only way to tell those apart.
 */
async function readTokenScopes(facebook: Record<string, string>): Promise<Record<string, unknown>> {
  const appSecret = await getSecret("META_APP_SECRET");
  if (!appSecret || !facebook.access_token) return { scopes: null };
  try {
    const token = await fbPageToken(facebook);
    const appResp = await fetch(
      `https://graph.facebook.com/v21.0/app?access_token=${encodeURIComponent(token)}`,
    );
    const app = await appResp.json();
    if (!appResp.ok || !app?.id) throw new Error(app?.error?.message ?? `HTTP ${appResp.status}`);

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}` +
        `&access_token=${encodeURIComponent(`${app.id}|${appSecret}`)}`,
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
    const info = data?.data ?? {};
    return {
      scopes: (info.scopes ?? []) as string[],
      tokenType: String(info.type ?? ""),
      tokenExpiresAt: info.expires_at ? new Date(Number(info.expires_at) * 1000).toISOString() : "never",
      tokenValid: info.is_valid !== false,
    };
  } catch (e) {
    return { scopes: null, scopesError: (e as Error).message };
  }
}

/**
 * A page token that does not expire, from a short-lived user token.
 *
 * The Graph API Explorer hands out tokens that die in an hour, and a page
 * token inherits the life of the user token it came from — which is how the
 * site ended up publishing with a credential that expired the same afternoon.
 * Exchanging the user token for a long-lived one first makes the page token
 * permanent, and that exchange needs the app secret, so it happens here rather
 * than in a browser or a URL the admin has to assemble by hand.
 */
async function exchangeForPageToken(
  supabase: any,
  userToken: string,
  pageId: string,
): Promise<Record<string, unknown>> {
  const appSecret = await getSecret("META_APP_SECRET");
  if (!appSecret) throw new Error("חסר App Secret — בלעדיו אי אפשר להאריך טוקן");

  // The token names its own app, so nothing has to be typed or stored.
  const appResp = await fetch(
    `https://graph.facebook.com/v21.0/app?access_token=${encodeURIComponent(userToken)}`,
  );
  const app = await appResp.json();
  if (!appResp.ok || !app?.id) {
    throw new Error(`הטוקן לא זוהה: ${app?.error?.message ?? `HTTP ${appResp.status}`}`);
  }

  const longResp = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(String(app.id))}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(userToken)}`,
  );
  const long = await longResp.json();
  if (!longResp.ok || !long?.access_token) {
    throw new Error(`ההארכה נכשלה: ${long?.error?.message ?? `HTTP ${longResp.status}`}`);
  }

  // The page's own token, derived from a long-lived user token, never expires.
  const pagesResp = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&limit=100` +
      `&access_token=${encodeURIComponent(String(long.access_token))}`,
  );
  const pages = await pagesResp.json();
  if (!pagesResp.ok) {
    throw new Error(`קריאת העמודים נכשלה: ${pages?.error?.message ?? `HTTP ${pagesResp.status}`}`);
  }
  const page = ((pages?.data ?? []) as any[]).find((p) => String(p.id) === String(pageId));
  if (!page?.access_token) {
    const names = ((pages?.data ?? []) as any[]).map((p) => `${p.name} (${p.id})`).join(", ");
    throw new Error(`העמוד ${pageId} לא נמצא בין העמודים של הטוקן. נמצאו: ${names || "אף עמוד"}`);
  }

  // Both rows carry the same page token: Instagram is reached through the page.
  for (const platform of ["facebook", "instagram"]) {
    const { data: row } = await supabase
      .from("social_accounts")
      .select("credentials")
      .eq("platform", platform)
      .maybeSingle();
    if (!row) continue;
    await supabase
      .from("social_accounts")
      .update({
        credentials: { ...(row.credentials ?? {}), access_token: page.access_token },
        updated_at: new Date().toISOString(),
      })
      .eq("platform", platform);
  }

  // Report back what was stored, by its properties rather than its value.
  const debugResp = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(page.access_token)}` +
      `&access_token=${encodeURIComponent(`${app.id}|${appSecret}`)}`,
  );
  const debug = await debugResp.json().catch(() => ({}));
  const info = debug?.data ?? {};
  return {
    page: page.name,
    expiresAt: info.expires_at ? new Date(Number(info.expires_at) * 1000).toISOString() : "never",
    scopes: (info.scopes ?? []) as string[],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "check");
    const accounts = await loadAccounts(supabase);
    const facebook = accounts.facebook?.credentials ?? {};

    // ---------- what the panel may know about the setup ----------
    if (action === "check") {
      // Booleans, never the values: these two are secrets and the panel's job
      // is only to say whether they are still missing.
      const appSecretSet = !!(await getSecret("META_APP_SECRET"));
      const verifyTokenSet = !!(await getSecret("META_VERIFY_TOKEN"));

      let subscribedFields: string[] | null = null;
      let subscriptionError: string | null = null;
      if (facebook.page_id && facebook.access_token) {
        try {
          const token = await fbPageToken(facebook);
          const resp = await fetch(
            `https://graph.facebook.com/v21.0/${facebook.page_id}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
          );
          const data = await resp.json();
          if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
          const apps = (data?.data ?? []) as any[];
          subscribedFields = apps.flatMap((a) => (a?.subscribed_fields ?? []) as string[]);
        } catch (e) {
          subscriptionError = (e as Error).message;
        }
      }

      // The other half of the subscription, and the one that is easy to miss:
      // the page being subscribed to the app says nothing about the app being
      // subscribed to an object's fields. Both have to be true for a single
      // comment to be delivered, and only this call can tell them apart.
      const appSubscriptions = await readAppSubscriptions(facebook);
      const tokenInfo = await readTokenScopes(facebook);

      return json({
        ok: true,
        webhookUrl: WEBHOOK_URL,
        appSecretSet,
        verifyTokenSet,
        pageConnected: !!(facebook.page_id && facebook.access_token),
        instagramConnected: !!(accounts.instagram?.credentials.ig_user_id),
        subscribedFields,
        subscriptionError,
        ...appSubscriptions,
        ...tokenInfo,
      });
    }

    // ---------- subscribe our app to the page's deliveries ----------
    if (action === "subscribe") {
      if (!facebook.page_id || !facebook.access_token) {
        return json({ error: "חבר קודם את עמוד הפייסבוק (Page ID וטוקן) בכרטיס הרשתות" }, 400);
      }
      const token = await fbPageToken(facebook);
      const resp = await fetch(`https://graph.facebook.com/v21.0/${facebook.page_id}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed_fields: FIELDS, access_token: token }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return json(
          { error: `Meta ${resp.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 200)}` },
          400,
        );
      }

      // Half two: the app's own subscription to each object's fields. Without
      // it the page is subscribed to an app that asked for nothing, and not a
      // single comment is ever delivered — with no error anywhere to say so.
      const appSecret = await getSecret("META_APP_SECRET");
      const verifyToken = await getSecret("META_VERIFY_TOKEN");
      const objects: { object: string; ok: boolean; fields: string; error?: string }[] = [];
      if (!appSecret || !verifyToken) {
        return json({
          error: "העמוד חובר, אבל חסרים App Secret או Verify Token — בלעדיהם אי אפשר לרשום את השדות",
        }, 400);
      }
      const appResp = await fetch(
        `https://graph.facebook.com/v21.0/app?access_token=${encodeURIComponent(token)}`,
      );
      const app = await appResp.json();
      if (!appResp.ok || !app?.id) {
        return json({ error: `לא הצלחתי לזהות את האפליקציה: ${app?.error?.message ?? appResp.status}` }, 400);
      }
      for (const object of Object.keys(OBJECT_FIELDS)) {
        objects.push(await subscribeAppToObject(String(app.id), appSecret, verifyToken, object));
      }

      const failed = objects.filter((o) => !o.ok);
      if (failed.length > 0) {
        return json(
          { error: failed.map((f) => `${f.object}: ${f.error}`).join(" · ") },
          400,
        );
      }
      return json({ ok: true, subscribed: FIELDS.split(","), objects });
    }

    // ---------- dry run of the matcher ----------
    if (action === "test") {
      const text = String(body?.text ?? "");
      if (!text.trim()) return json({ error: "חסר טקסט לבדיקה" }, 400);
      const { data } = await supabase
        .from("social_automations")
        .select("id, article_id, platform, post_external_id, keywords, message, public_reply, link_url, status, expires_at")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      const rules = (data ?? []) as AutomationRow[];
      for (const rule of rules) {
        const keyword = matchesKeywords(text, rule.keywords);
        if (keyword) {
          const { data: article } = await supabase
            .from("articles")
            .select("title")
            .eq("id", rule.article_id)
            .maybeSingle();
          return json({
            ok: true,
            matched: true,
            keyword,
            platform: rule.platform,
            title: article?.title ?? "",
            link: rule.link_url,
          });
        }
      }
      return json({ ok: true, matched: false, checked: rules.length });
    }

    // ---------- what Meta knows about a commenter ----------
    // Asked before anything is built on it: the field that says whether a
    // person follows the account is documented, but documentation has been a
    // poor guide to what this app is actually entitled to.
    if (action === "profile") {
      const senderId = String(body?.senderId ?? "").trim();
      if (!senderId) return json({ error: "חסר מזהה משתמש" }, 400);
      const creds = accounts.instagram?.credentials ?? {};
      const token = await fbPageToken({ ...creds, page_id: facebook.page_id, access_token: facebook.access_token });
      const fields = "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user,is_verified_user";
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(senderId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return json({ ok: false, error: data?.error?.message ?? `HTTP ${resp.status}`, code: data?.error?.code }, 200);
      }
      // Deliberately not the name or the picture: the question here is only
      // which fields this app may read.
      return json({
        ok: true,
        fieldsReturned: Object.keys(data),
        followsUs: data?.is_user_follow_business ?? null,
        weFollowThem: data?.is_business_follow_user ?? null,
      });
    }

    // ---------- a page token that does not expire ----------
    if (action === "exchangeToken") {
      const userToken = String(body?.userToken ?? "").trim();
      if (!userToken) return json({ error: "חסר טוקן משתמש" }, 400);
      if (!facebook.page_id) return json({ error: "חסר Page ID בכרטיס הרשתות" }, 400);
      try {
        const result = await exchangeForPageToken(supabase, userToken, facebook.page_id);
        return json({ ok: true, ...result });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }

    return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
  } catch (e: any) {
    console.error("meta-automations error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
