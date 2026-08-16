import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateCreateStudentInput,
  submitSitemapToGoogle,
  validateNotificationInput,
  sendAdminNotificationEmail,
} from "@/lib/admin.server";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

// ---------- admin-create-student ----------
export const adminCreateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name: string; course_ids?: string[] }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { email, password, full_name, course_ids } = validateCreateStudentInput(data);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, account_type: "student" },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message || "יצירת המשתמש נכשלה");
    }
    const newUserId = created.user.id;

    await supabaseAdmin.from("profiles").upsert(
      { id: newUserId, email, full_name },
      { onConflict: "id" },
    );
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: newUserId, role: "user" },
      { onConflict: "user_id,role" },
    );

    if (course_ids.length > 0) {
      const rows = course_ids.map((cid) => ({
        course_id: cid,
        user_id: newUserId,
        full_name,
        email,
        payment_status: "free",
      }));
      const { error: enrErr } = await supabaseAdmin.from("course_enrollments").insert(rows);
      if (enrErr) {
        return {
          user_id: newUserId,
          warning: `המשתמש נוצר אך שיוך הקורסים נכשל: ${enrErr.message}`,
        };
      }
    }

    return { user_id: newUserId };
  });

// ---------- submit-sitemap ----------
export const submitSitemap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return submitSitemapToGoogle(supabaseAdmin);
  });

// ---------- send-admin-notification (public, no auth) ----------
export const sendAdminNotification = createServerFn({ method: "POST" })
  .inputValidator((d: { type: string; recordId: string }) => d)
  .handler(async ({ data }) => {
    const { type, recordId } = validateNotificationInput(data);
    await sendAdminNotificationEmail(type, recordId);
    return { ok: true };
  });
