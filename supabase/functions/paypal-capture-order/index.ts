import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PAYPAL_MODE = (Deno.env.get('PAYPAL_MODE') ?? 'live').toLowerCase();
const PAYPAL_BASE = PAYPAL_MODE === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID')!;
  const secret = Deno.env.get('PAYPAL_CLIENT_SECRET')!;
  const auth = btoa(`${clientId}:${secret}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { orderID, course_id, full_name, email, phone, coupon_code, user_id } = body;
    if (!orderID || !course_id || !full_name || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: course } = await admin
      .from('courses').select('id,price,currency').eq('id', course_id).maybeSingle();
    if (!course) throw new Error('Course not found');

    // Capture the payment
    const token = await getAccessToken();
    const capRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const capJson = await capRes.json();
    if (!capRes.ok || capJson.status !== 'COMPLETED') {
      throw new Error(`Capture failed: ${JSON.stringify(capJson)}`);
    }

    const capture = capJson.purchase_units?.[0]?.payments?.captures?.[0];
    const paidAmount = Number(capture?.amount?.value ?? 0);
    const paidCurrency = capture?.amount?.currency_code ?? 'ILS';

    // Redeem coupon AFTER successful payment
    let discountPercent: number | null = null;
    if (coupon_code && coupon_code.trim()) {
      const { data: rRow } = await admin.rpc('redeem_course_coupon', {
        p_course_id: course_id,
        p_code: coupon_code.trim(),
      });
      const row = Array.isArray(rRow) ? rRow[0] : rRow;
      if (row?.valid) discountPercent = row.discount_percent ?? null;
    }

    // Upsert enrollment as paid
    const { data: existing } = await admin
      .from('course_enrollments').select('id')
      .eq('course_id', course_id)
      .or(user_id ? `user_id.eq.${user_id},email.eq.${email}` : `email.eq.${email}`)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      course_id,
      user_id: user_id ?? null,
      full_name,
      email,
      phone: phone ?? null,
      payment_status: 'paid',
      coupon_code: coupon_code?.trim() || null,
      discount_percent: discountPercent,
      paypal_order_id: orderID,
      paid_amount: paidAmount,
      paid_currency: paidCurrency,
      paid_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await admin.from('course_enrollments').update(payload).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('course_enrollments').insert(payload);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true, orderID, paidAmount, paidCurrency }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
