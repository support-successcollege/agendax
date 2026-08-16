// PayPal operations, executed in Supabase Edge Functions.
//
// PAYPAL_CLIENT_SECRET stays server-side; only the public client id is returned
// to the browser. `user_id` is intentionally NOT sent from here — the capture
// function derives it from the caller's JWT so a client cannot enroll a
// different account.
import { invokeEdge } from "@/lib/edge";

export type PaypalConfig = { clientId: string; mode: string };

export const getPaypalConfig = () => invokeEdge<PaypalConfig>("paypal-config", {});

export type CreatePaypalOrderInput = {
  course_id: string;
  coupon_code?: string | null;
};

export const createPaypalOrder = ({ data }: { data: CreatePaypalOrderInput }) =>
  invokeEdge<{ orderID: string; amount: number; currency: string }>(
    "paypal-create-order",
    data,
  );

export type CapturePaypalOrderInput = {
  orderID: string;
  course_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  coupon_code?: string | null;
};

export const capturePaypalOrder = ({ data }: { data: CapturePaypalOrderInput }) =>
  invokeEdge<{ success: true; orderID: string; paidAmount: number; paidCurrency: string }>(
    "paypal-capture-order",
    data,
  );
