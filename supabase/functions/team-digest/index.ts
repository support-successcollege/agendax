// deno-lint-ignore-file no-explicit-any
// The team's daily publishing schedule, by email: every article going live
// today (already published + scheduled) plus the social queue for the day,
// in order, with the article link and the ready-made post/story images — so whoever runs the social accounts can
// prepare stories and post them by hand right after each post goes up.
//
// Body: { to?: string[], date?: "YYYY-MM-DD" }  (defaults: TEAM_DIGEST_TO env,
// today in Israel). Cron-or-admin authorized.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorize, corsHeaders, json } from "../_shared/ingest.ts";

const SITE_URL = "https://agendax.co.il";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const TZ = "Asia/Jerusalem";

const PALETTE = ["#0d3c99", "#7c3aed", "#0f766e", "#be123c", "#b45309", "#166534", "#0e7490", "#9d174d"];
function categoryColor(key: string): string {
  const s = (key || "").trim().toLowerCase();
  if (!s) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "YYYY-MM-DD" of a moment in Israel time. */
function israelDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function israelTime(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

type Row = {
  id: string;
  slug: string | null;
  title: string;
  category: string;
  category_slug: string;
  is_draft: boolean;
  scheduled_at: string | null;
  published_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY חסר" }, 500);
    const FROM = Deno.env.get("MAIL_FROM") || "Agendax <onboarding@resend.dev>";
    const to: string[] = Array.isArray(body?.to) && body.to.length
      ? body.to
      : (Deno.env.get("TEAM_DIGEST_TO") || "info@agendax.co.il").split(",").map((s: string) => s.trim()).filter(Boolean);

    const day = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : israelDate(new Date());

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Wide net in UTC, exact filter by Israel calendar day below.
    const dayStart = new Date(`${day}T00:00:00+03:00`);
    const dayEnd = new Date(`${day}T23:59:59+03:00`);
    const lo = new Date(dayStart.getTime() - 3 * 3600_000).toISOString();
    const hi = new Date(dayEnd.getTime() + 3 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("articles")
      .select("id, slug, title, category, category_slug, is_draft, scheduled_at, published_at")
      .neq("category_slug", "marketing")
      .or(`and(is_draft.eq.false,published_at.gte.${lo},published_at.lte.${hi}),and(is_draft.eq.true,scheduled_at.gte.${lo},scheduled_at.lte.${hi})`)
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = ((data ?? []) as Row[])
      .map((r) => {
        const when = r.is_draft ? r.scheduled_at : (r.published_at ?? r.scheduled_at);
        return { ...r, when: when ? new Date(when) : null };
      })
      .filter((r) => r.when && israelDate(r.when) === day)
      .sort((a, b) => a.when!.getTime() - b.when!.getTime());

    // The social queue for the same day: what goes out to the networks and when.
    const { data: qData } = await supabase
      .from("social_queue")
      .select("id, article_id, platforms, kind, scheduled_at, status, source")
      .neq("status", "cancelled")
      .gte("scheduled_at", lo)
      .lte("scheduled_at", hi)
      .order("scheduled_at", { ascending: true })
      .limit(100);
    const queueRows = ((qData ?? []) as any[]).filter((q) => israelDate(new Date(q.scheduled_at)) === day);
    const queueArticleIds = [...new Set(queueRows.map((q) => q.article_id))].filter((id) => !rows.some((r) => r.id === id));
    const extraTitles = new Map<string, { title: string; slug: string | null; category: string }>();
    if (queueArticleIds.length) {
      const { data: extra } = await supabase.from("articles").select("id, title, slug, category").in("id", queueArticleIds);
      for (const a of (extra ?? []) as any[]) extraTitles.set(a.id, a);
    }
    const PLATFORM_HE: Record<string, string> = { facebook: "פייסבוק", instagram: "אינסטגרם", linkedin: "לינקדאין", x: "X" };
    const QSTATUS: Record<string, string> = {
      queued: `<span style="color:#0369a1">בתור</span>`,
      publishing: `<span style="color:#b45309">מפרסם…</span>`,
      posted: `<span style="color:#166534;font-weight:700">פורסם</span>`,
      failed: `<span style="color:#b91c1c;font-weight:700">נכשל</span>`,
    };
    const queueItems = queueRows.map((q) => {
      const a = rows.find((r) => r.id === q.article_id) ?? extraTitles.get(q.article_id);
      const title = a?.title ?? "כתבה שנמחקה";
      const url = `${SITE_URL}/article/${encodeURIComponent(a?.slug || q.article_id)}`;
      const img = `${SUPABASE_URL}/functions/v1/social-image?articleId=${q.article_id}&variant=${q.kind === "story" ? "story" : "post"}`;
      const kind = q.kind === "story"
        ? `<span style="display:inline-block;background:#c026d3;color:#fff;font-size:12px;padding:2px 8px;border-radius:4px">סטורי</span>`
        : `<span style="display:inline-block;background:#0d3c99;color:#fff;font-size:12px;padding:2px 8px;border-radius:4px">פוסט</span>`;
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums">${israelTime(new Date(q.scheduled_at))}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${kind}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;line-height:1.4"><a href="${url}" style="color:#0d3c99;text-decoration:none;font-weight:600">${esc(title)}</a></td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-size:13px">${(q.platforms as string[]).map((p) => PLATFORM_HE[p] ?? p).join(", ")}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${QSTATUS[q.status] ?? esc(q.status)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-size:13px"><a href="${img}" style="color:#0d3c99">תמונה</a></td>
        </tr>`;
    }).join("");

    const now = new Date();
    const items = rows.map((r) => {
      const live = !r.is_draft;
      const url = `${SITE_URL}/article/${encodeURIComponent(r.slug || r.id)}`;
      // Smart links: render on first click if the file is not there yet.
      const postImg = `${SUPABASE_URL}/functions/v1/social-image?articleId=${r.id}&variant=post`;
      const storyImg = `${SUPABASE_URL}/functions/v1/social-image?articleId=${r.id}&variant=story`;
      const color = categoryColor(r.category_slug || r.category);
      const status = live
        ? `<span style="color:#166534;font-weight:700">פורסם</span>`
        : r.when! < now
          ? `<span style="color:#b45309;font-weight:700">ממתין לפרסום</span>`
          : `<span style="color:#64748b">מתוזמן</span>`;
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums">${israelTime(r.when!)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb"><span style="display:inline-block;background:${color};color:#fff;font-size:12px;padding:2px 8px;border-radius:4px">${esc(r.category)}</span></td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;line-height:1.4"><a href="${url}" style="color:#0d3c99;text-decoration:none;font-weight:600">${esc(r.title)}</a></td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${status}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-size:13px">
            <a href="${postImg}" style="color:#0d3c99">תמונת פוסט</a> ·
            <a href="${storyImg}" style="color:#0d3c99">תמונת סטורי</a>
          </td>
        </tr>`;
    }).join("");

    const published = rows.filter((r) => !r.is_draft).length;
    const pending = rows.length - published;
    const dateLabel = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .format(dayStart);

    const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:860px;margin:0 auto;padding:24px 16px">
  <div style="background:#0d3c99;border-radius:12px 12px 0 0;padding:18px 22px;color:#fff">
    <div style="font-size:13px;opacity:.8">Agendax · לוז פרסומים לצוות</div>
    <div style="font-size:22px;font-weight:800;margin-top:4px">${esc(dateLabel)}</div>
    <div style="font-size:14px;margin-top:6px;opacity:.9">${rows.length} כתבות היום · ${published} כבר באוויר · ${pending} בהמתנה</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:6px 10px 16px">
    ${rows.length === 0
      ? `<p style="padding:18px 8px;color:#64748b">אין כתבות מתוזמנות להיום.</p>`
      : `<table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="text-align:right;color:#64748b;font-size:12px">
        <th style="padding:8px">שעה</th><th style="padding:8px">קטגוריה</th><th style="padding:8px">כותרת</th><th style="padding:8px">סטטוס</th><th style="padding:8px">תמונות</th>
      </tr></thead>
      <tbody>${items}</tbody></table>`}
    <h3 style="margin:22px 8px 6px;font-size:16px">פרסומים ברשתות היום (${queueRows.length})</h3>
    ${queueRows.length === 0
      ? `<p style="padding:6px 8px 12px;color:#64748b">אין פרסומים מתוזמנים לרשתות היום.</p>`
      : `<table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="text-align:right;color:#64748b;font-size:12px">
        <th style="padding:8px">שעה</th><th style="padding:8px">סוג</th><th style="padding:8px">כותרת</th><th style="padding:8px">רשתות</th><th style="padding:8px">סטטוס</th><th style="padding:8px">תמונה</th>
      </tr></thead>
      <tbody>${queueItems}</tbody></table>`}
    <div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border-radius:10px;font-size:13px;line-height:1.7;color:#334155">
      <b>איך עובדים עם הלוז:</b><br>
      1. הטבלה הראשונה — מה עולה באתר ומתי. הטבלה השנייה — הפוסטים/סטוריז לרשתות לפי התור בפאנל (אפשר להזיז, לבטל ולהוסיף שם).<br>
      2. סטורי ידני: אחרי שהפוסט עלה — פתחו את <b>תמונת הסטורי</b> בטלפון, שמרו, והעלו סטורי עם מדבקת קישור לכתבה (הקישור בכותרת).<br>
      3. קישורי התמונות תמיד עובדים — אם התמונה עוד לא הוכנה, הלחיצה הראשונה מייצרת אותה (כ-5 שניות) ואז פותחת אותה.<br>
      4. שורה "ממתין לפרסום" = עברה השעה והכתבה עוד טיוטה — כדאי להציץ בפאנל.
    </div>
    <div style="margin-top:14px;font-size:12px;color:#94a3b8">נשלח אוטומטית ממערכת Agendax · <a href="${SITE_URL}/admin" style="color:#94a3b8">פאנל ניהול</a></div>
  </div>
</div></body></html>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: `לוז פרסומים להיום — ${day.split("-").reverse().join(".")} (${rows.length} כתבות)`,
        html,
      }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ error: `Resend ${resp.status}: ${JSON.stringify(result).slice(0, 200)}` }, 502);
    return json({ ok: true, to, day, articles: rows.length, published, pending, social: queueRows.length, id: result?.id });
  } catch (e: any) {
    console.error("team-digest error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
