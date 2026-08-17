set search_path = public;

-- Constraints and indexes, in dependency order.
--
-- The raw catalog dump listed constraints alphabetically by table, which put
-- article_comments' foreign key ahead of the articles primary key it points
-- at. Phase order fixes that: keys first, then everything that references
-- them. Each statement is guarded, so re-running over a partial apply is safe.

do $$
begin
  -- phase 1: primary keys — everything else hangs off these
  if not exists (select 1 from pg_constraint where conname = 'article_comments_pkey') then
    alter table public.article_comments add constraint article_comments_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'article_reactions_pkey') then
    alter table public.article_reactions add constraint article_reactions_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'articles_pkey') then
    alter table public.articles add constraint articles_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_pkey') then
    alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_coupons_pkey') then
    alter table public.course_coupons add constraint course_coupons_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_enrollments_pkey') then
    alter table public.course_enrollments add constraint course_enrollments_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_lessons_pkey') then
    alter table public.course_lessons add constraint course_lessons_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_modules_pkey') then
    alter table public.course_modules add constraint course_modules_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_pkey') then
    alter table public.courses add constraint courses_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_pkey') then
    alter table public.event_registrations add constraint event_registrations_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_pkey') then
    alter table public.events add constraint events_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_applications_pkey') then
    alter table public.job_applications add constraint job_applications_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_pkey') then
    alter table public.jobs add constraint jobs_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_resources_pkey') then
    alter table public.lesson_resources add constraint lesson_resources_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_views_pkey') then
    alter table public.lesson_views add constraint lesson_views_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'newsletter_subscribers_pkey') then
    alter table public.newsletter_subscribers add constraint newsletter_subscribers_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'page_views_pkey') then
    alter table public.page_views add constraint page_views_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_inquiries_pkey') then
    alter table public.product_inquiries add constraint product_inquiries_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_pkey') then
    alter table public.products add constraint products_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_pkey') then
    alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sidebar_widgets_pkey') then
    alter table public.sidebar_widgets add constraint sidebar_widgets_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_settings_pkey') then
    alter table public.site_settings add constraint site_settings_pkey PRIMARY KEY (key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_roles_pkey') then
    alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'widget_clicks_pkey') then
    alter table public.widget_clicks add constraint widget_clicks_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'widget_form_submissions_pkey') then
    alter table public.widget_form_submissions add constraint widget_form_submissions_pkey PRIMARY KEY (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'widget_impressions_pkey') then
    alter table public.widget_impressions add constraint widget_impressions_pkey PRIMARY KEY (id);
  end if;

  -- phase 2: unique constraints (FK targets like categories_slug_key)
  if not exists (select 1 from pg_constraint where conname = 'article_reactions_article_id_session_id_key') then
    alter table public.article_reactions add constraint article_reactions_article_id_session_id_key UNIQUE (article_id, session_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_slug_key') then
    alter table public.categories add constraint categories_slug_key UNIQUE (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_coupons_course_id_code_key') then
    alter table public.course_coupons add constraint course_coupons_course_id_code_key UNIQUE (course_id, code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_slug_key') then
    alter table public.courses add constraint courses_slug_key UNIQUE (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_slug_key') then
    alter table public.events add constraint events_slug_key UNIQUE (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'newsletter_subscribers_email_key') then
    alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_key UNIQUE (email);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_roles_user_id_role_key') then
    alter table public.user_roles add constraint user_roles_user_id_role_key UNIQUE (user_id, role);
  end if;

  -- phase 3: checks
  if not exists (select 1 from pg_constraint where conname = 'article_reactions_reaction_type_check') then
    alter table public.article_reactions add constraint article_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['like'::text, 'dislike'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_coupons_discount_percent_check') then
    alter table public.course_coupons add constraint course_coupons_discount_percent_check CHECK (((discount_percent >= 0) AND (discount_percent <= 100)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_application_type_check') then
    alter table public.jobs add constraint jobs_application_type_check CHECK ((application_type = ANY (ARRAY['form'::text, 'external_link'::text])));
  end if;

  -- phase 4: foreign keys — all referenced keys now exist
  if not exists (select 1 from pg_constraint where conname = 'article_comments_article_id_fkey') then
    alter table public.article_comments add constraint article_comments_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'article_reactions_article_id_fkey') then
    alter table public.article_reactions add constraint article_reactions_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_coupons_course_id_fkey') then
    alter table public.course_coupons add constraint course_coupons_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_enrollments_user_id_fkey') then
    alter table public.course_enrollments add constraint course_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_enrollments_course_id_fkey') then
    alter table public.course_enrollments add constraint course_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_lessons_module_id_fkey') then
    alter table public.course_lessons add constraint course_lessons_module_id_fkey FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_lessons_course_id_fkey') then
    alter table public.course_lessons add constraint course_lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_modules_course_id_fkey') then
    alter table public.course_modules add constraint course_modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_user_id_fkey') then
    alter table public.event_registrations add constraint event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_event_id_fkey') then
    alter table public.event_registrations add constraint event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_applications_job_id_fkey') then
    alter table public.job_applications add constraint job_applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_resources_lesson_id_fkey') then
    alter table public.lesson_resources add constraint lesson_resources_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_views_user_id_fkey') then
    alter table public.lesson_views add constraint lesson_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_views_lesson_id_fkey') then
    alter table public.lesson_views add constraint lesson_views_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'page_views_article_id_fkey') then
    alter table public.page_views add constraint page_views_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_inquiries_product_id_fkey') then
    alter table public.product_inquiries add constraint product_inquiries_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_roles_user_id_fkey') then
    alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'widget_clicks_widget_id_fkey') then
    alter table public.widget_clicks add constraint widget_clicks_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES sidebar_widgets(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'widget_form_submissions_widget_id_fkey') then
    alter table public.widget_form_submissions add constraint widget_form_submissions_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES sidebar_widgets(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'widget_impressions_widget_id_fkey') then
    alter table public.widget_impressions add constraint widget_impressions_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES sidebar_widgets(id) ON DELETE CASCADE;
  end if;
end $$;

-- indexes
CREATE UNIQUE INDEX IF NOT EXISTS articles_slug_key ON public.articles USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON public.articles USING btree (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.course_enrollments USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_paypal_order_id ON public.course_enrollments USING btree (paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.course_enrollments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON public.job_applications USING btree (job_id);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_views_user_lesson_unique ON public.lesson_views USING btree (user_id, lesson_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON public.page_views USING btree (viewed_at);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON public.page_views USING btree (path);
CREATE INDEX IF NOT EXISTS idx_page_views_article_id ON public.page_views USING btree (article_id);
CREATE INDEX IF NOT EXISTS idx_widget_clicks_widget_id ON public.widget_clicks USING btree (widget_id);