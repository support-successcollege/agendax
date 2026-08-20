// deno-lint-ignore-file no-explicit-any
// Composes and sends the Agendax newsletter through Resend.
//
// Input (admin JWT required):
//   subject      — email subject (required)
//   intro        — optional opening paragraph
//   articleIds   — explicit article ids; omitted → the freshest published
//   category     — a category NAME: limits auto-picked articles to it, and
//                  recipients to subscribers interested in it (or in "כללי")
//   count        — how many auto-picked articles (default 5, max 10)
//   testEmail    — when set, sends ONLY to this address and records test=true
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";

const SITE_URL = "https://agendax.co.il";
const BRAND_BLUE = "#0d3c99";
const BRAND_CYAN = "#00b8e0";

const PALETTE = ["#0d3c99", "#7c3aed", "#0f766e", "#be123c", "#b45309", "#166534", "#0e7490", "#9d174d"];
function categoryColor(key: string): string {
  const s = (key || "").trim().toLowerCase();
  if (!s) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type ArticleRow = {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string;
  category: string;
  category_slug: string;
  image_url: string;
};

// Table-based, inline-styled, light-background HTML — the only dialect every
// email client renders. RTL throughout.
function buildHtml(opts: {
  subject: string;
  intro: string | null;
  articles: ArticleRow[];
  unsubscribeUrl: string;
}): string {
  const articleBlocks = opts.articles
    .map((a) => {
      const url = `${SITE_URL}/article/${encodeURIComponent(a.slug || a.id)}`;
      const color = categoryColor(a.category_slug || a.category);
      return `
      <tr><td style="padding:0 0 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8f2;border-radius:12px;overflow:hidden;background:#ffffff;">
          <tr><td>
            <a href="${url}" style="text-decoration:none;">
              <img src="${esc(a.image_url)}" width="600" alt="" style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
            </a>
          </td></tr>
          <tr><td style="padding:16px 20px 20px 20px;">
            <span style="display:inline-block;background:${color};color:#ffffff;font-size:12px;font-weight:bold;padding:3px 10px;border-radius:4px;margin-bottom:8px;">${esc(a.category)}</span>
            <a href="${url}" style="text-decoration:none;color:#0b1533;">
              <div style="font-size:20px;font-weight:bold;line-height:1.3;margin:6px 0 8px 0;">${esc(a.title)}</div>
            </a>
            <div style="font-size:14px;color:#4a5568;line-height:1.6;">${esc(a.excerpt)}</div>
            <a href="${url}" style="display:inline-block;margin-top:12px;color:${BRAND_BLUE};font-size:14px;font-weight:bold;text-decoration:none;">לכתבה המלאה ←</a>
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f5fb;font-family:Arial,Helvetica,sans-serif;" dir="rtl">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5fb;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:${BRAND_BLUE};background-image:linear-gradient(90deg,${BRAND_BLUE},${BRAND_CYAN});border-radius:12px 12px 0 0;padding:22px 24px;" align="center">
          <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:2px;">AGENDA<span style="color:#9be9ff;">X</span></div>
          <div style="font-size:12px;color:#d8ecff;margin-top:4px;">סדר היום של הטכנולוגיה, ה-AI והעסקים</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;">
          ${opts.intro ? `<p style="font-size:15px;color:#2d3748;line-height:1.7;margin:0 0 20px 0;">${esc(opts.intro)}</p>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${articleBlocks}
          </table>
          <p style="font-size:12px;color:#a0aec0;text-align:center;margin:8px 0 0 0;">
            נשלח מ-<a href="${SITE_URL}" style="color:${BRAND_BLUE};text-decoration:none;">agendax.co.il</a>
            · <a href="${opts.unsubscribeUrl}" style="color:#a0aec0;">הסרה מרשימת התפוצה</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const subject = String(body?.subject || "").trim();
    if (!subject) return json({ error: "חסר נושא למייל" }, 400);
    const intro = body?.intro ? String(body.intro).slice(0, 2000) : null;
    const category = body?.category ? String(body.category) : null;
    const count = Math.min(Math.max(Number(body?.count) || 5, 1), 10);
    const testEmail = body?.testEmail ? String(body.testEmail) : null;
    const explicitIds: string[] = Array.isArray(body?.articleIds) ? body.articleIds : [];

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY חסר" }, 500);
    const FROM = Deno.env.get("MAIL_FROM") || "Agendax <onboarding@resend.dev>";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Articles --------------------------------------------------------
    let articlesQuery = supabase
      .from("articles")
      .select("id, slug, title, excerpt, category, category_slug, image_url")
      .eq("is_draft", false)
      .order("published_at", { ascending: false, nullsFirst: false });
    if (explicitIds.length > 0) {
      articlesQuery = supabase
        .from("articles")
        .select("id, slug, title, excerpt, category, category_slug, image_url")
        .in("id", explicitIds);
    } else if (category) {
      articlesQuery = articlesQuery.eq("category", category).limit(count);
    } else {
      articlesQuery = articlesQuery.limit(count);
    }
    const { data: articles, error: artErr } = await articlesQuery;
    if (artErr) throw new Error(`טעינת כתבות נכשלה: ${artErr.message}`);
    if (!articles || articles.length === 0) {
      return json({ error: "לא נמצאו כתבות לניוזלטר" }, 400);
    }
    // Explicit picks keep the picker's order.
    const ordered = explicitIds.length > 0
      ? explicitIds.map((id) => (articles as ArticleRow[]).find((a) => a.id === id)).filter(Boolean) as ArticleRow[]
      : (articles as ArticleRow[]);

    // --- Recipients ------------------------------------------------------
    type Sub = { id: string; email: string; full_name: string | null; interest_category: string | null };
    let recipients: Sub[];
    if (testEmail) {
      recipients = [{ id: "00000000-0000-0000-0000-000000000000", email: testEmail, full_name: null, interest_category: null }];
    } else {
      let subsQuery = supabase
        .from("newsletter_subscribers")
        .select("id, email, full_name, interest_category")
        .eq("is_active", true);
      // A category newsletter goes to its own audience plus the generalists.
      if (category) subsQuery = subsQuery.in("interest_category", [category, "כללי"]);
      const { data: subs, error: subErr } = await subsQuery;
      if (subErr) throw new Error(`טעינת נרשמים נכשלה: ${subErr.message}`);
      recipients = (subs ?? []) as Sub[];
      if (recipients.length === 0) return json({ error: "אין נרשמים פעילים לקהל הזה" }, 400);
    }

    // --- Send (per-recipient, for a personal unsubscribe link) -----------
    // Resend's batch endpoint takes up to 100 emails per call.
    const emails = recipients.map((r) => ({
      from: FROM,
      to: [r.email],
      subject,
      html: buildHtml({
        subject,
        intro,
        articles: ordered,
        unsubscribeUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/newsletter-unsubscribe?id=${r.id}`,
      }),
    }));

    let sent = 0;
    const failures: string[] = [];
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100);
      const resp = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!resp.ok) {
        const t = await resp.text();
        failures.push(`batch ${i / 100 + 1}: ${resp.status} ${t.slice(0, 200)}`);
      } else {
        sent += chunk.length;
      }
    }

    await supabase.from("newsletter_sends").insert({
      subject,
      category,
      article_ids: ordered.map((a) => a.id),
      recipients_count: sent,
      test: !!testEmail,
    });

    return json({
      ok: failures.length === 0,
      sent,
      total: recipients.length,
      articles: ordered.length,
      failures,
    });
  } catch (e: any) {
    console.error("send-newsletter error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
