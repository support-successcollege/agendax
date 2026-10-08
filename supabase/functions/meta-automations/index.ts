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
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";
import { getSecret } from "../_shared/secrets.ts";
import { fbPageToken } from "../_shared/social.ts";
import { type AutomationRow, matchesKeywords } from "../_shared/dmAutomation.ts";

/** Comments and story/DM replies — the two deliveries this feature lives on. */
const FIELDS = "feed,messages";

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

      return json({
        ok: true,
        webhookUrl: WEBHOOK_URL,
        appSecretSet,
        verifyTokenSet,
        pageConnected: !!(facebook.page_id && facebook.access_token),
        instagramConnected: !!(accounts.instagram?.credentials.ig_user_id),
        subscribedFields,
        subscriptionError,
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
      return json({ ok: true, subscribed: FIELDS.split(",") });
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

    return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
  } catch (e: any) {
    console.error("meta-automations error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
