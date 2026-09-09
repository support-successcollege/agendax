-- 37: נעילת פונקציות פנימיות (advisors security, 09/09/2026, אושר ע"י יניב).
--
-- Postgres נותן EXECUTE ל-PUBLIC על כל פונקציה חדשה, ולכן anon ו-authenticated
-- יכלו לקרוא דרך PostgREST rpc() לפונקציות שאין להן שום סיבה להיות ציבוריות.
-- מה שנשאר פתוח בכוונה: has_role ו-has_course_access - policies של RLS על
-- courses / events / products / lessons קוראות להן גם עבור anon, ו-revoke היה
-- שובר קריאה ציבורית של האתר הסטטי. גם notify_google_index נשארת ל-authenticated:
-- היא טריגר על articles ורצה כשאדמין מעדכן כתבה.

-- טריגר-אירוע ensure_rls. רץ כ-owner, אף אחד לא צריך לקרוא לו ישירות.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- טריגר on_auth_user_created על auth.users. מי שמכניס שם הוא supabase_auth_admin.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- טריגר על articles. anon לעולם לא כותב ל-articles.
revoke execute on function public.notify_google_index() from public, anon;

-- cron שבועי (agendax-hero-rotation) כ-postgres. הפרונט רק קורא hero_rotation.
revoke execute on function public.refresh_hero_rotation() from public, anon, authenticated;
