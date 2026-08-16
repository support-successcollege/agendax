// Admin operations, executed in Supabase Edge Functions.
//
// Each of these needs the service-role key (creating auth users) or a Google
// service-account key (Search Console, Gmail), neither of which can exist in a
// static bundle. The Edge Functions re-check the caller's admin role server-side.
import { invokeEdge } from "@/lib/edge";

export type CreateStudentInput = {
  email: string;
  password: string;
  full_name: string;
  course_ids?: string[];
};

export const adminCreateStudent = ({ data }: { data: CreateStudentInput }) =>
  invokeEdge<{ user_id: string; warning?: string }>("admin-create-student", data);

export type SubmitSitemapResult = {
  success: boolean;
  submittedAt: string;
  sitemapResults?: { success: boolean; url?: string; error?: string }[];
  indexingResults?: { success: boolean; url?: string; error?: string }[];
  registeredSites?: string[];
};

// Called with no arguments from the admin dashboard.
export const submitSitemap = () =>
  invokeEdge<SubmitSitemapResult>("submit-sitemap", {});

export type AdminNotificationInput = {
  type: "newsletter" | "pending_comment" | "widget_form" | (string & {});
  recordId: string;
};

export const sendAdminNotification = ({ data }: { data: AdminNotificationInput }) =>
  invokeEdge<{ ok: true }>("send-admin-notification", data);
