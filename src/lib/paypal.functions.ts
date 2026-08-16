import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

type CreatePaypalOrderInput = {
  course_id: string;
  coupon_code?: string | null;
};

type CapturePaypalOrderInput = {
  orderID: string;
  course_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  coupon_code?: string | null;
};

export const getPaypalConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const clientId = process.env['PAYPAL_CLIENT_ID'] ?? '';
  const mode = (process.env['PAYPAL_MODE'] ?? 'live').toLowerCase();
  return { clientId, mode };
});

export const createPaypalOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreatePaypalOrderInput) => d)
  .handler(async ({ data }) => {
    const { createPaypalOrderLogic } = await import('@/lib/paypal.server');
    return createPaypalOrderLogic(data);
  });

export const capturePaypalOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CapturePaypalOrderInput) => d)
  .handler(async ({ data, context }) => {
    const { capturePaypalOrderLogic } = await import('@/lib/paypal.server');
    return capturePaypalOrderLogic({ ...data, user_id: context.userId });
  });
