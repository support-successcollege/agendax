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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { course_id, coupon_code } = await req.json();
    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: course, error: cErr } = await admin
      .from('courses').select('id,title,price,currency').eq('id', course_id).maybeSingle();
    if (cErr || !course) throw new Error('Course not found');

    let price = Number(course.price);
    let discount = 0;
    let grantsFree = false;

    if (coupon_code && coupon_code.trim()) {
      const { data: cRow } = await admin.rpc('validate_course_coupon', {
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
      return new Response(JSON.stringify({ error: 'Amount is zero; use free enrollment path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getAccessToken();
    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
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

    return new Response(JSON.stringify({
      orderID: orderJson.id,
      amount: finalPrice,
      currency: course.currency || 'ILS',
      discount_percent: discount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
