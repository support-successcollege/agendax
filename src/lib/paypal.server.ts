import type { Database } from '@/integrations/supabase/types';

export function getPaypalBase(): string {
  const mode = (process.env['PAYPAL_MODE'] ?? 'live').toLowerCase();
  return mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

export async function getPaypalAccessToken(paypalBase: string): Promise<string> {
  const clientId = process.env['PAYPAL_CLIENT_ID']!;
  const secret = process.env['PAYPAL_CLIENT_SECRET']!;
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${await res.text()}`);
  const j = await res.json();
  return j.access_token;
}

export async function createPaypalOrderLogic(input: { course_id: string; coupon_code?: string | null }) {
  const { course_id, coupon_code } = input;
  if (!course_id) {
    throw new Error('course_id required');
  }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: course, error: cErr } = await supabaseAdmin
    .from('courses').select('id,title,price,currency').eq('id', course_id).maybeSingle();
  if (cErr || !course) throw new Error('Course not found');

  let price = Number(course.price);
  let discount = 0;
  let grantsFree = false;

  if (coupon_code && coupon_code.trim()) {
    const { data: cRow } = await supabaseAdmin.rpc('validate_course_coupon', {
      p_course_id: course_id,
      p_code: coupon_code.trim(),
    });
    const row = Array.isArray(cRow) ? cRow[0] : cRow;
    if (row?.valid) {
      discount = row.discount_percent ?? 0;
      grantsFree = !!row.grants_free_access;
    }
  }

  const finalPrice = grantsFree ? 0 : Math.max(0, +(price * (1 - discount / 100)).toFixed(2));
  if (finalPrice === 0) {
    throw new Error('Amount is zero; use free enrollment path');
  }

  const paypalBase = getPaypalBase();
  const token = await getPaypalAccessToken(paypalBase);
  const orderRes = await fetch(`${paypalBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: course.id,
        description: course.title,
        amount: {
          currency_code: course.currency || 'ILS',
          value: finalPrice.toFixed(2),
        },
      }],
    }),
  });
  const orderJson = await orderRes.json();
  if (!orderRes.ok) throw new Error(`PayPal create order failed: ${JSON.stringify(orderJson)}`);

  return {
    orderID: orderJson.id,
    amount: finalPrice,
    currency: course.currency || 'ILS',
    discount_percent: discount,
  };
}

export async function capturePaypalOrderLogic(input: {
  orderID: string;
  course_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  coupon_code?: string | null;
  user_id: string;
}) {
  const { orderID, course_id, full_name, email, phone, coupon_code, user_id } = input;
  if (!orderID || !course_id || !full_name || !email) {
    throw new Error('Missing required fields');
  }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: course } = await supabaseAdmin
    .from('courses').select('id,price,currency').eq('id', course_id).maybeSingle();
  if (!course) throw new Error('Course not found');

  const paypalBase = getPaypalBase();
  const token = await getPaypalAccessToken(paypalBase);
  const capRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderID}/capture`, {
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

  let discountPercent: number | null = null;
  if (coupon_code && coupon_code.trim()) {
    const { data: rRow } = await supabaseAdmin.rpc('redeem_course_coupon', {
      p_course_id: course_id,
      p_code: coupon_code.trim(),
    });
    const row = Array.isArray(rRow) ? rRow[0] : rRow;
    if (row?.valid) discountPercent = row.discount_percent ?? null;
  }

  const { data: existing } = await supabaseAdmin
    .from('course_enrollments').select('id')
    .eq('course_id', course_id)
    .or(user_id ? `user_id.eq.${user_id},email.eq.${email}` : `email.eq.${email}`)
    .maybeSingle();

  const payload = {
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
    const { error } = await supabaseAdmin.from('course_enrollments').update(payload).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from('course_enrollments').insert(payload);
    if (error) throw error;
  }

  return { success: true, orderID, paidAmount, paidCurrency };
}
