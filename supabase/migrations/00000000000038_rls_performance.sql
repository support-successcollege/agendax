-- ביצועי RLS: תיקון ממצאי advisors (performance) בסכמה public.
--
-- מה:
-- 1. auth_rls_initplan (67 policies): כל קריאה ל-auth.uid() בתוך policy הופכת
--    ל-(select auth.uid()). Postgres מחשב subselect סקלרי פעם אחת לשאילתה
--    (InitPlan) במקום פעם לכל שורה. הביטוי עצמו לא משתנה - רק העטיפה.
--    השורות נוצרו מתוך pg_policies ב-format(), לא הוקלדו ידנית.
-- 2. multiple_permissive_policies: איחוד רק כשה-policies זהות ב-cmd וב-roles
--    וההבדל הוא רק בביטוי (OR של שני הביטויים = בדיוק מה ש-Postgres עשה עד היום
--    בין שתי policies מתירניות). בנוסף הוסרו שלוש policies שהיו כפילות מלאה:
--    אותו ביטוי, אותם roles, ו-SELECT שמכוסה כולו ע"י policy FOR ALL באותה טבלה.
--    זוגות של ALL מול SELECT או של roles שונים לא נגעו בהם (ראה סוף הקובץ).
--
-- למה: האתר הסטטי נבנה עם מפתח anon מתוך articles/authors/categories/... וכל
-- שאילתה עברה דרך policies שהריצו auth.uid() ו-has_role() לכל שורה.
--
-- סמנטיקה: אפס שינוי. לקריאת anon: auth.uid() הוא null בשתי הצורות,
-- has_role(null, 'admin') מחזיר false בשתי הצורות.
--
-- אידמפוטנטי: drop policy if exists לפני create policy; alter policy נכשל רק אם
-- ה-policy לא קיימת, ולכן חלק 1 (איחודים) רץ לפני חלק 2 (alter) ואינו כולל את
-- ה-policies שנמחקו.

-- ---------------------------------------------------------------------------
-- חלק 1: איחוד policies מתירניות זהות ב-cmd וב-roles
-- ---------------------------------------------------------------------------

-- articles: שתי policies FOR SELECT ל-public. לפני: (is_draft = false) | has_role(admin).
-- אחרי: policy אחת עם OR. anon ממשיך לראות רק is_draft = false.
drop policy if exists "Admins can view all articles" on public.articles;
drop policy if exists "Published articles are publicly readable" on public.articles;
drop policy if exists "Public reads published articles, admins read all" on public.articles;
create policy "Public reads published articles, admins read all" on public.articles
  for select
  using ((is_draft = false) or has_role((select auth.uid()), 'admin'::app_role));

-- profiles: שתי policies FOR SELECT ל-public. לפני: (auth.uid() = id) | has_role(admin).
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users read own profile, admins read all" on public.profiles;
create policy "Users read own profile, admins read all" on public.profiles
  for select
  using (((select auth.uid()) = id) or has_role((select auth.uid()), 'admin'::app_role));

-- כפילות מלאה: SELECT עם has_role(admin) ל-public כשקיימת באותה טבלה policy
-- FOR ALL ל-public עם אותו ביטוי בדיוק. ה-ALL מכסה SELECT; ה-SELECT מיותרת.
drop policy if exists "Admins can view subscribers" on public.newsletter_subscribers; -- מכוסה ע"י "Admins can manage subscribers" (ALL)
drop policy if exists "Admins can view all jobs" on public.jobs;                       -- מכוסה ע"י "Admins can manage jobs" (ALL)
drop policy if exists "Admins can view all roles" on public.user_roles;                -- מכוסה ע"י "Admins can manage roles" (ALL)

-- ---------------------------------------------------------------------------
-- חלק 2: auth.uid() -> (select auth.uid()), אותו ביטוי בדיוק
-- ---------------------------------------------------------------------------

alter policy "Admins manage ai advice" on public.ai_advice using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can delete comments" on public.article_comments using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can update comments" on public.article_comments using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can view all comments" on public.article_comments using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can view reactions" on public.article_reactions using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can delete articles" on public.articles using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can insert articles" on public.articles with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can update articles" on public.articles using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage authors" on public.authors using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can delete categories" on public.categories using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can insert categories" on public.categories with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can update categories" on public.categories using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can manage coupons" on public.course_coupons using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy enrollments_admin_delete on public.course_enrollments using (has_role((select auth.uid()), 'admin'::app_role));
alter policy enrollments_admin_update on public.course_enrollments using (has_role((select auth.uid()), 'admin'::app_role));
alter policy enrollments_read_own on public.course_enrollments using ((((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'admin'::app_role)));
alter policy lessons_access_read on public.course_lessons using ((is_free OR has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM course_enrollments e
  WHERE ((e.course_id = course_lessons.course_id) AND (e.user_id = (select auth.uid())) AND (e.payment_status = ANY (ARRAY['free'::text, 'paid'::text])))))));
alter policy lessons_admin_all on public.course_lessons using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy modules_admin_all on public.course_modules using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy courses_admin_all on public.courses using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy courses_public_read on public.courses using (((is_published = true) OR has_role((select auth.uid()), 'admin'::app_role)));
alter policy "Admins manage editors picks" on public.editors_picks using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy evreg_admin_delete on public.event_registrations using (has_role((select auth.uid()), 'admin'::app_role));
alter policy evreg_admin_update on public.event_registrations using (has_role((select auth.uid()), 'admin'::app_role));
alter policy evreg_read_own on public.event_registrations using ((((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'admin'::app_role)));
alter policy events_admin_all on public.events using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy events_public_read on public.events using (((is_published = true) OR has_role((select auth.uid()), 'admin'::app_role)));
alter policy "Admins manage industry events" on public.industry_events using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage ingest config" on public.ingest_config using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage ingest items" on public.ingest_items using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins read ingest runs" on public.ingest_runs using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can delete applications" on public.job_applications using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can view applications" on public.job_applications using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can manage jobs" on public.jobs using (has_role((select auth.uid()), 'admin'::app_role));
alter policy resources_access_read on public.lesson_resources using ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM (course_lessons l
     JOIN course_enrollments e ON ((e.course_id = l.course_id)))
  WHERE ((l.id = lesson_resources.lesson_id) AND (e.user_id = (select auth.uid())) AND (e.payment_status = ANY (ARRAY['free'::text, 'paid'::text])))))));
alter policy resources_admin_all on public.lesson_resources using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy views_insert_self on public.lesson_views with check (((select auth.uid()) = user_id));
alter policy views_read_own on public.lesson_views using ((((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'admin'::app_role)));
alter policy views_update_own on public.lesson_views using (((select auth.uid()) = user_id));
alter policy "Admins manage manager runs" on public.manager_runs using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage news sources" on public.news_sources using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage newsletter sends" on public.newsletter_sends using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can manage subscribers" on public.newsletter_subscribers using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can view page views" on public.page_views using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins delete inquiries" on public.product_inquiries using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins view inquiries" on public.product_inquiries using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage products" on public.products using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Anyone can view active products" on public.products using (((is_active = true) OR has_role((select auth.uid()), 'admin'::app_role)));
alter policy "Users can update own profile" on public.profiles using (((select auth.uid()) = id));
alter policy "Admins can manage widgets" on public.sidebar_widgets using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage site settings" on public.site_settings using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage social accounts" on public.social_accounts using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage social posts" on public.social_posts using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage social queue" on public.social_queue using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins manage social settings" on public.social_settings using (has_role((select auth.uid()), 'admin'::app_role)) with check (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can manage roles" on public.user_roles using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Users can view their own roles" on public.user_roles using (((select auth.uid()) = user_id));
alter policy "Admins can view widget clicks" on public.widget_clicks using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can delete widget submissions" on public.widget_form_submissions using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can view widget submissions" on public.widget_form_submissions using (has_role((select auth.uid()), 'admin'::app_role));
alter policy "Admins can view widget impressions" on public.widget_impressions using (has_role((select auth.uid()), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- מה נשאר בכוונה (multiple_permissive_policies שלא נגעו בו):
-- * ALL מול SELECT באותם roles: course_lessons, course_modules, courses, events,
--   lesson_resources, products, sidebar_widgets, jobs, user_roles,
--   newsletter_subscribers (INSERT). cmd שונה; פתרון דורש פיצול ה-ALL לשלוש
--   policies (insert/update/delete) - מחוץ להיקף המשימה.
-- * roles שונים ({authenticated} ALL מול {public} SELECT): authors, editors_picks,
--   industry_events, site_settings. אלו טבלאות הבנייה הסטטית - לא נוגעים.
-- ---------------------------------------------------------------------------
