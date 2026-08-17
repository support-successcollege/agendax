// Both pinned to one version that provably ships the ./cors subpath export —
// 2.89.0 predates it and boots with BOOT_ERROR on the edge runtime.
import { corsHeaders } from 'npm:@supabase/supabase-js@2.111.0/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { z } from 'npm:zod@3.23.8';

// No generated Database types are available inside the Deno runtime, and an
// untyped client makes supabase-js resolve every row to `never`. `any` keeps
// the column reads below type-checkable.
type Db = ReturnType<typeof createClient<any>>;

// Where notifications land. Overridable so staging can divert them.
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'info@agendax.co.il';
const SITE_URL = 'https://agendax.co.il';

// Must be an address on a domain verified in Resend, or the API rejects the
// send. Until agendax.co.il is verified there, set MAIL_FROM to a resend.dev
// sender to test.
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Agendax <notifications@agendax.co.il>';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const BodySchema = z.object({
  type: z.enum(['pending_comment', 'widget_form', 'newsletter']),
  recordId: z.string().uuid(),
});

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A valid address here lets the admin hit Reply and land on the person who
// submitted, instead of on the no-reply sender.
type AdminEmail = { subject: string; html: string; replyTo?: string };

const asReplyTo = (value: unknown): string | undefined => {
  const address = typeof value === 'string' ? value.trim() : '';
  return address.includes('@') ? address : undefined;
};

async function buildEmailFromDb(
  supabase: Db,
  type: string,
  recordId: string,
): Promise<AdminEmail | null> {
  if (type === 'pending_comment') {
    const { data } = await supabase
      .from('article_comments')
      .select('author_name, author_email, content, article_id, is_approved')
      .eq('id', recordId)
      .maybeSingle();
    if (!data) return null;
    let articleTitle = '';
    if (data.article_id) {
      const { data: art } = await supabase
        .from('articles').select('title').eq('id', data.article_id).maybeSingle();
      articleTitle = art?.title || '';
    }
    return {
      subject: 'תגובה חדשה ממתינה לאישור',
      replyTo: asReplyTo(data.author_email),
      html: `<div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <h2>תגובה חדשה ממתינה לאישור</h2>
        <p><b>שם:</b> ${escapeHtml(data.author_name)}</p>
        <p><b>מייל:</b> ${escapeHtml(data.author_email || '—')}</p>
        <p><b>כתבה:</b> ${escapeHtml(articleTitle || data.article_id || '')}</p>
        <p><b>תגובה:</b></p>
        <blockquote style="border-right:3px solid #ccc;padding:8px 12px;background:#f9f9f9;">${escapeHtml(data.content)}</blockquote>
        <p><a href="${SITE_URL}/admin">מעבר ללוח הניהול לאישור</a></p>
      </div>`,
    };
  }
  if (type === 'widget_form') {
    const { data } = await supabase
      .from('widget_form_submissions')
      .select('widget_id, data')
      .eq('id', recordId)
      .maybeSingle();
    if (!data) return null;
    let widgetTitle = '';
    if (data.widget_id) {
      const { data: w } = await supabase
        .from('sidebar_widgets').select('title').eq('id', data.widget_id).maybeSingle();
      widgetTitle = w?.title || '';
    }
    const fields = (data.data || {}) as Record<string, unknown>;
    const rows = Object.entries(fields)
      .map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:bold;">${escapeHtml(k)}</td><td style="padding:4px 8px;">${escapeHtml(String(v))}</td></tr>`)
      .join('');
    return {
      subject: `רישום חדש בטופס${widgetTitle ? `: ${widgetTitle}` : ''}`,
      // Widget forms are free-form, so the email field is whatever the widget
      // happened to name it.
      replyTo: asReplyTo(fields['email'] ?? fields['אימייל'] ?? fields['מייל']),
      html: `<div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <h2>רישום חדש מטופס חלונית</h2>
        ${widgetTitle ? `<p><b>חלונית:</b> ${escapeHtml(widgetTitle)}</p>` : ''}
        <table style="border-collapse:collapse;">${rows}</table>
        <p><a href="${SITE_URL}/admin">מעבר ללוח הניהול</a></p>
      </div>`,
    };
  }
  // newsletter
  const { data } = await supabase
    .from('newsletter_subscribers')
    .select('full_name, email, phone, interest_category')
    .eq('id', recordId)
    .maybeSingle();
  if (!data) return null;
  return {
    subject: 'נרשם/ת חדש/ה לניוזלטר',
    replyTo: asReplyTo(data.email),
    html: `<div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
      <h2>נרשם/ת חדש/ה לניוזלטר</h2>
      <p><b>שם מלא:</b> ${escapeHtml(data.full_name || '')}</p>
      <p><b>מייל:</b> ${escapeHtml(data.email || '')}</p>
      <p><b>טלפון:</b> ${escapeHtml(data.phone || '—')}</p>
      <p><b>קטגוריה:</b> ${escapeHtml(data.interest_category || '—')}</p>
    </div>`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { type, recordId } = parsed.data;

    const email = await buildEmailFromDb(supabase, type, recordId);
    if (!email) {
      return new Response(JSON.stringify({ error: 'Record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendRes = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [ADMIN_EMAIL],
        subject: email.subject,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend send failed', resendRes.status, errText);
      return new Response(
        JSON.stringify({ error: 'Email send failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
