import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.89.0';
import { z } from 'npm:zod@3.23.8';

const ADMIN_EMAIL = 'yzyns44@gmail.com';
const SITE_URL = 'https://yznews.store';
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';

const BodySchema = z.object({
  type: z.enum(['pending_comment', 'widget_form', 'newsletter']),
  recordId: z.string().uuid(),
});

function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
}

async function buildEmailFromDb(
  supabase: ReturnType<typeof createClient>,
  type: string,
  recordId: string,
): Promise<{ subject: string; html: string } | null> {
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GOOGLE_MAIL_API_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { type, recordId } = parsed.data;

    const email = await buildEmailFromDb(supabase, type, recordId);
    if (!email) {
      return new Response(JSON.stringify({ error: 'Record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raw = [
      `To: ${ADMIN_EMAIL}`,
      `Subject: ${encodeSubject(email.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      '',
      email.html,
    ].join('\r\n');

    const gmailRes = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GOOGLE_MAIL_API_KEY,
      },
      body: JSON.stringify({ raw: b64url(raw) }),
    });

    if (!gmailRes.ok) {
      const errText = await gmailRes.text();
      console.error('Gmail send failed', gmailRes.status, errText);
      return new Response(
        JSON.stringify({ error: 'Gmail send failed' }),
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
