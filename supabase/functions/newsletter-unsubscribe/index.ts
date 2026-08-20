// One-click unsubscribe target for the newsletter's footer link.
// verify_jwt = false: the visitor is anonymous; the subscriber row id (an
// unguessable uuid that only that subscriber's email carries) is the
// credential, and the RPC only ever flips is_active to false.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const page = (title: string, body: string) => `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#0b1533;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
  <div>
    <div style="font-size:28px;font-weight:900;letter-spacing:2px;margin-bottom:16px;">AGENDA<span style="color:#00d2fc;">X</span></div>
    <h1 style="font-size:20px;margin:0 0 8px 0;">${title}</h1>
    <p style="color:#aab8d8;margin:0 0 24px 0;">${body}</p>
    <a href="https://agendax.co.il" style="color:#00d2fc;text-decoration:none;">חזרה לאתר ←</a>
  </div>
</body></html>`;

const html = (markup: string, status = 200) => {
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(markup, { status, headers });
};

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return html(page("קישור לא תקין", "הקישור שהגעת ממנו אינו שלם. אפשר לפנות אלינו במייל."), 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await supabase.rpc("unsubscribe_newsletter", { _id: id });
  if (error) {
    console.error("unsubscribe failed", error);
    return html(page("משהו השתבש", "לא הצלחנו להסיר אותך כרגע. נסו שוב מאוחר יותר."), 500);
  }

  return html(page("הוסרת מרשימת התפוצה", "לא תקבלו מאיתנו עוד ניוזלטרים. אפשר להירשם שוב מהאתר בכל רגע."));
});
