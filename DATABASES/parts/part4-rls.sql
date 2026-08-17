set search_path = public;

-- ======================================================================
-- ROW LEVEL SECURITY
-- ======================================================================

alter table public.article_comments enable row level security;

alter table public.article_reactions enable row level security;

alter table public.articles enable row level security;

alter table public.categories enable row level security;

alter table public.course_coupons enable row level security;

alter table public.course_enrollments enable row level security;

alter table public.course_lessons enable row level security;

alter table public.course_modules enable row level security;

alter table public.courses enable row level security;

alter table public.event_registrations enable row level security;

alter table public.events enable row level security;

alter table public.job_applications enable row level security;

alter table public.jobs enable row level security;

alter table public.lesson_resources enable row level security;

alter table public.lesson_views enable row level security;

alter table public.newsletter_subscribers enable row level security;

alter table public.page_views enable row level security;

alter table public.product_inquiries enable row level security;

alter table public.products enable row level security;

alter table public.profiles enable row level security;

alter table public.sidebar_widgets enable row level security;

alter table public.site_settings enable row level security;

alter table public.user_roles enable row level security;

alter table public.widget_clicks enable row level security;

alter table public.widget_form_submissions enable row level security;

alter table public.widget_impressions enable row level security;



-- ======================================================================
-- POLICIES
-- ======================================================================

create policy "Admins can delete comments" on public.article_comments as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can view all comments" on public.article_comments as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can update comments" on public.article_comments as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can submit comments" on public.article_comments as PERMISSIVE for INSERT to public with check (true);

create policy reactions_delete_any on public.article_reactions as PERMISSIVE for DELETE to public using (true);

create policy "Admins can view reactions" on public.article_reactions as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can insert reactions" on public.article_reactions as PERMISSIVE for INSERT to public with check (true);

create policy "Admins can view all articles" on public.articles as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can insert articles" on public.articles as PERMISSIVE for INSERT to authenticated with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Published articles are publicly readable" on public.articles as PERMISSIVE for SELECT to public using ((is_draft = false));

create policy "Admins can update articles" on public.articles as PERMISSIVE for UPDATE to authenticated using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can delete articles" on public.articles as PERMISSIVE for DELETE to authenticated using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can delete categories" on public.categories as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can insert categories" on public.categories as PERMISSIVE for INSERT to public with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Categories are publicly readable" on public.categories as PERMISSIVE for SELECT to public using (true);

create policy "Admins can update categories" on public.categories as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage coupons" on public.course_coupons as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy enrollments_read_own on public.course_enrollments as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

create policy enrollments_admin_delete on public.course_enrollments as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy enrollments_admin_update on public.course_enrollments as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy enrollments_insert_free_only on public.course_enrollments as PERMISSIVE for INSERT to anon, authenticated with check (((payment_status = 'free'::text) AND (paypal_order_id IS NULL) AND ((paid_amount IS NULL) OR (paid_amount = (0)::numeric)) AND (paid_at IS NULL)));

create policy lessons_access_read on public.course_lessons as PERMISSIVE for SELECT to public using ((is_free OR has_role(auth.uid(), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM course_enrollments e
  WHERE ((e.course_id = course_lessons.course_id) AND (e.user_id = auth.uid()) AND (e.payment_status = ANY (ARRAY['free'::text, 'paid'::text])))))));

create policy lessons_admin_all on public.course_lessons as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy modules_admin_all on public.course_modules as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy modules_public_read on public.course_modules as PERMISSIVE for SELECT to public using (true);

create policy courses_public_read on public.courses as PERMISSIVE for SELECT to public using (((is_published = true) OR has_role(auth.uid(), 'admin'::app_role)));

create policy courses_admin_all on public.courses as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy evreg_admin_delete on public.event_registrations as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy evreg_admin_update on public.event_registrations as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy evreg_insert_any on public.event_registrations as PERMISSIVE for INSERT to public with check (true);

create policy evreg_read_own on public.event_registrations as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

create policy events_admin_all on public.events as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy events_public_read on public.events as PERMISSIVE for SELECT to public using (((is_published = true) OR has_role(auth.uid(), 'admin'::app_role)));

create policy "Anyone can submit applications" on public.job_applications as PERMISSIVE for INSERT to public with check (true);

create policy "Admins can delete applications" on public.job_applications as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can view applications" on public.job_applications as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can view active jobs" on public.jobs as PERMISSIVE for SELECT to public using ((is_active = true));

create policy "Admins can manage jobs" on public.jobs as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can view all jobs" on public.jobs as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy resources_access_read on public.lesson_resources as PERMISSIVE for SELECT to public using ((has_role(auth.uid(), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM (course_lessons l
     JOIN course_enrollments e ON ((e.course_id = l.course_id)))
  WHERE ((l.id = lesson_resources.lesson_id) AND (e.user_id = auth.uid()) AND (e.payment_status = ANY (ARRAY['free'::text, 'paid'::text])))))));

create policy resources_admin_all on public.lesson_resources as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy views_update_own on public.lesson_views as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));

create policy views_read_own on public.lesson_views as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

create policy views_insert_self on public.lesson_views as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));

create policy "Anyone can subscribe to newsletter" on public.newsletter_subscribers as PERMISSIVE for INSERT to public with check (true);

create policy "Admins can view subscribers" on public.newsletter_subscribers as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage subscribers" on public.newsletter_subscribers as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can insert page views" on public.page_views as PERMISSIVE for INSERT to public with check (true);

create policy "Admins can view page views" on public.page_views as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins delete inquiries" on public.product_inquiries as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins view inquiries" on public.product_inquiries as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can submit inquiries" on public.product_inquiries as PERMISSIVE for INSERT to public with check (true);

create policy "Admins manage products" on public.products as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can view active products" on public.products as PERMISSIVE for SELECT to public using (((is_active = true) OR has_role(auth.uid(), 'admin'::app_role)));

create policy "Users can update own profile" on public.profiles as PERMISSIVE for UPDATE to public using ((auth.uid() = id));

create policy "Admins can view all profiles" on public.profiles as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Users can view own profile" on public.profiles as PERMISSIVE for SELECT to public using ((auth.uid() = id));

create policy "Admins can manage widgets" on public.sidebar_widgets as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can view active widgets" on public.sidebar_widgets as PERMISSIVE for SELECT to public using ((is_active = true));

create policy "Admins manage site settings" on public.site_settings as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Public read site settings" on public.site_settings as PERMISSIVE for SELECT to public using (true);

create policy "Admins can view all roles" on public.user_roles as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage roles" on public.user_roles as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Users can view their own roles" on public.user_roles as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));

create policy "Admins can view widget clicks" on public.widget_clicks as PERMISSIVE for SELECT to authenticated using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can record widget clicks" on public.widget_clicks as PERMISSIVE for INSERT to anon, authenticated with check (true);

create policy "Admins can delete widget submissions" on public.widget_form_submissions as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can submit widget forms" on public.widget_form_submissions as PERMISSIVE for INSERT to public with check (true);

create policy "Admins can view widget submissions" on public.widget_form_submissions as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

create policy "Anyone can insert widget impressions" on public.widget_impressions as PERMISSIVE for INSERT to public with check (true);

create policy "Admins can view widget impressions" on public.widget_impressions as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'admin'::app_role));

