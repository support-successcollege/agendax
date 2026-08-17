-- Agendax - full schema for project kjazrljlfreczicstymr (eu-west-1).

-- #  00000000000000_initial_schema.sql

-- Agendax initial schema.
--
-- Recovered from the Lovable-owned Supabase project on 2026-08-17 by dumping
-- pg_catalog through the SQL editor: that project is not administrable from our
-- account, so `supabase db dump` could not reach it. This file is therefore the
-- only complete record of the schema and must stay in version control.
--
-- Contents: 1 enum, 26 tables, 57 constraints, 11 indexes, 23 functions,
-- 8 triggers, RLS enabled on every table, 71 policies.
--
-- Storage buckets are NOT created here (they live in the storage schema and are
-- created through the dashboard or the CLI):
--   article-images   public
--   article-videos   public, 100 MB limit
--   job-cvs          private
--   course-content   private

set search_path = public;
-- Function bodies validate lazily: the dump is alphabetical, so callers can
-- precede their callees (has_course_access calls has_role).
set check_function_bodies = off;


-- ======================================================================
-- ENUMS
-- ======================================================================

create type public.app_role as enum ('admin', 'user');



-- ======================================================================
-- TABLES
-- ======================================================================

create table public.article_comments (
  id uuid default gen_random_uuid() not null,
  article_id uuid not null,
  author_name text not null,
  content text not null,
  is_approved boolean default false not null,
  created_at timestamp with time zone default now() not null,
  approved_at timestamp with time zone,
  author_email text
);

create table public.article_reactions (
  id uuid default gen_random_uuid() not null,
  article_id uuid not null,
  reaction_type text not null,
  session_id text not null,
  created_at timestamp with time zone default now() not null
);

create table public.articles (
  id uuid default gen_random_uuid() not null,
  title text not null,
  excerpt text not null,
  content text not null,
  category text not null,
  category_slug text not null,
  date date default CURRENT_DATE not null,
  image_url text not null,
  author text default 'מערכת Agendax'::text not null,
  is_breaking boolean default false,
  is_featured boolean default false,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_draft boolean default false not null,
  scheduled_at timestamp with time zone,
  published_at timestamp with time zone,
  slug text
);

create table public.categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  display_order integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.course_coupons (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  code text not null,
  discount_percent integer default 0 not null,
  grants_free_access boolean default false not null,
  max_uses integer,
  uses_count integer default 0 not null,
  is_active boolean default true not null,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.course_enrollments (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  user_id uuid,
  full_name text not null,
  email text not null,
  phone text,
  payment_status text default 'free'::text not null,
  notes text,
  enrolled_at timestamp with time zone default now() not null,
  coupon_code text,
  discount_percent integer,
  paypal_order_id text,
  paid_amount numeric,
  paid_currency text,
  paid_at timestamp with time zone
);

create table public.course_lessons (
  id uuid default gen_random_uuid() not null,
  module_id uuid not null,
  course_id uuid not null,
  title text not null,
  description text,
  video_url text,
  video_file_url text,
  presentation_url text,
  duration_minutes integer,
  is_free boolean default false not null,
  display_order integer default 0,
  created_at timestamp with time zone default now() not null
);

create table public.course_modules (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  title text not null,
  description text,
  display_order integer default 0,
  created_at timestamp with time zone default now() not null
);

create table public.courses (
  id uuid default gen_random_uuid() not null,
  title text not null,
  slug text not null,
  short_description text,
  description text,
  cover_image_url text,
  instructor_name text,
  instructor_bio text,
  price numeric(10,2) default 0 not null,
  original_price numeric(10,2),
  currency text default 'ILS'::text not null,
  duration_hours numeric(5,1),
  level text default 'beginner'::text,
  category text,
  is_published boolean default false not null,
  display_order integer default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.event_registrations (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  user_id uuid,
  full_name text not null,
  email text not null,
  phone text,
  attendance_status text default 'registered'::text not null,
  registered_at timestamp with time zone default now() not null
);

create table public.events (
  id uuid default gen_random_uuid() not null,
  title text not null,
  slug text not null,
  description text,
  cover_image_url text,
  event_date date not null,
  event_time time without time zone,
  duration_minutes integer,
  location_type text default 'online'::text not null,
  location text,
  speaker_name text,
  speaker_bio text,
  price numeric(10,2) default 0 not null,
  max_attendees integer,
  registration_deadline timestamp with time zone,
  is_published boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.job_applications (
  id uuid default gen_random_uuid() not null,
  job_id uuid not null,
  full_name text not null,
  email text not null,
  phone text,
  cover_letter text,
  cv_url text,
  created_at timestamp with time zone default now() not null
);

create table public.jobs (
  id uuid default gen_random_uuid() not null,
  title text not null,
  company_name text not null,
  location text not null,
  job_type text not null,
  salary_range text,
  description text not null,
  image_url text,
  application_type text default 'form'::text not null,
  application_url text,
  display_order integer default 0,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.lesson_resources (
  id uuid default gen_random_uuid() not null,
  lesson_id uuid not null,
  title text not null,
  file_url text not null,
  file_type text,
  display_order integer default 0,
  created_at timestamp with time zone default now() not null
);

create table public.lesson_views (
  id uuid default gen_random_uuid() not null,
  lesson_id uuid not null,
  user_id uuid,
  completed boolean default false not null,
  viewed_at timestamp with time zone default now() not null
);

create table public.newsletter_subscribers (
  id uuid default gen_random_uuid() not null,
  email text not null,
  created_at timestamp with time zone default now() not null,
  is_active boolean default true not null,
  full_name text,
  phone text,
  interest_category text
);

create table public.page_views (
  id uuid default gen_random_uuid() not null,
  article_id uuid,
  viewed_at timestamp with time zone default now() not null,
  user_agent text,
  ip_hash text,
  referrer text,
  path text
);

create table public.product_inquiries (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  full_name text not null,
  email text not null,
  phone text,
  message text,
  created_at timestamp with time zone default now() not null
);

create table public.products (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  image_url text,
  price numeric(10,2),
  currency text default 'ILS'::text not null,
  external_checkout_url text,
  enable_inquiry boolean default true not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.profiles (
  id uuid not null,
  email text,
  full_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.sidebar_widgets (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  link_url text not null,
  button_text text default 'לחצו כאן'::text not null,
  icon text default '📊'::text,
  display_order integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  image_url text,
  widget_type text default 'card'::text not null,
  action_type text default 'link'::text not null,
  form_fields jsonb default '[]'::jsonb,
  categories text[]
);

create table public.site_settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone default now() not null
);

create table public.user_roles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  role app_role default 'user'::app_role not null,
  created_at timestamp with time zone default now() not null
);

create table public.widget_clicks (
  id uuid default gen_random_uuid() not null,
  widget_id uuid not null,
  clicked_at timestamp with time zone default now() not null
);

create table public.widget_form_submissions (
  id uuid default gen_random_uuid() not null,
  widget_id uuid not null,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.widget_impressions (
  id uuid default gen_random_uuid() not null,
  widget_id uuid not null,
  viewed_at timestamp with time zone default now() not null
);



-- ======================================================================
-- CONSTRAINTS
-- ======================================================================

-- Ordered by dependency, not by name: primary keys and unique constraints
-- first, foreign keys last, so every FK target exists when it is referenced.

alter table public.article_comments add constraint article_comments_pkey PRIMARY KEY (id);

alter table public.article_reactions add constraint article_reactions_pkey PRIMARY KEY (id);

alter table public.articles add constraint articles_pkey PRIMARY KEY (id);

alter table public.categories add constraint categories_pkey PRIMARY KEY (id);

alter table public.course_coupons add constraint course_coupons_pkey PRIMARY KEY (id);

alter table public.course_enrollments add constraint course_enrollments_pkey PRIMARY KEY (id);

alter table public.course_lessons add constraint course_lessons_pkey PRIMARY KEY (id);

alter table public.course_modules add constraint course_modules_pkey PRIMARY KEY (id);

alter table public.courses add constraint courses_pkey PRIMARY KEY (id);

alter table public.event_registrations add constraint event_registrations_pkey PRIMARY KEY (id);

alter table public.events add constraint events_pkey PRIMARY KEY (id);

alter table public.job_applications add constraint job_applications_pkey PRIMARY KEY (id);

alter table public.jobs add constraint jobs_pkey PRIMARY KEY (id);

alter table public.lesson_resources add constraint lesson_resources_pkey PRIMARY KEY (id);

alter table public.lesson_views add constraint lesson_views_pkey PRIMARY KEY (id);

alter table public.newsletter_subscribers add constraint newsletter_subscribers_pkey PRIMARY KEY (id);

alter table public.page_views add constraint page_views_pkey PRIMARY KEY (id);

alter table public.product_inquiries add constraint product_inquiries_pkey PRIMARY KEY (id);

alter table public.products add constraint products_pkey PRIMARY KEY (id);

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table public.sidebar_widgets add constraint sidebar_widgets_pkey PRIMARY KEY (id);

alter table public.site_settings add constraint site_settings_pkey PRIMARY KEY (key);

alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (id);

alter table public.widget_clicks add constraint widget_clicks_pkey PRIMARY KEY (id);

alter table public.widget_form_submissions add constraint widget_form_submissions_pkey PRIMARY KEY (id);

alter table public.widget_impressions add constraint widget_impressions_pkey PRIMARY KEY (id);

alter table public.article_reactions add constraint article_reactions_article_id_session_id_key UNIQUE (article_id, session_id);

alter table public.categories add constraint categories_slug_key UNIQUE (slug);

alter table public.course_coupons add constraint course_coupons_course_id_code_key UNIQUE (course_id, code);

alter table public.courses add constraint courses_slug_key UNIQUE (slug);

alter table public.events add constraint events_slug_key UNIQUE (slug);

alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_key UNIQUE (email);

alter table public.user_roles add constraint user_roles_user_id_role_key UNIQUE (user_id, role);

alter table public.article_reactions add constraint article_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['like'::text, 'dislike'::text])));

alter table public.course_coupons add constraint course_coupons_discount_percent_check CHECK (((discount_percent >= 0) AND (discount_percent <= 100)));

alter table public.jobs add constraint jobs_application_type_check CHECK ((application_type = ANY (ARRAY['form'::text, 'external_link'::text])));

alter table public.article_comments add constraint article_comments_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

alter table public.article_reactions add constraint article_reactions_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

alter table public.course_coupons add constraint course_coupons_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

alter table public.course_enrollments add constraint course_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.course_enrollments add constraint course_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

alter table public.course_lessons add constraint course_lessons_module_id_fkey FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE;

alter table public.course_lessons add constraint course_lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

alter table public.course_modules add constraint course_modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

alter table public.event_registrations add constraint event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.event_registrations add constraint event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

alter table public.job_applications add constraint job_applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

alter table public.lesson_resources add constraint lesson_resources_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;

alter table public.lesson_views add constraint lesson_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.lesson_views add constraint lesson_views_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;

alter table public.page_views add constraint page_views_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

alter table public.product_inquiries add constraint product_inquiries_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.widget_clicks add constraint widget_clicks_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES sidebar_widgets(id) ON DELETE CASCADE;

alter table public.widget_form_submissions add constraint widget_form_submissions_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES sidebar_widgets(id) ON DELETE CASCADE;

alter table public.widget_impressions add constraint widget_impressions_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES sidebar_widgets(id) ON DELETE CASCADE;

-- ======================================================================
-- INDEXES
-- ======================================================================

CREATE UNIQUE INDEX articles_slug_key ON public.articles USING btree (slug);

CREATE INDEX idx_articles_published_at ON public.articles USING btree (published_at DESC NULLS LAST);

CREATE INDEX idx_enrollments_course ON public.course_enrollments USING btree (course_id);

CREATE INDEX idx_course_enrollments_paypal_order_id ON public.course_enrollments USING btree (paypal_order_id);

CREATE INDEX idx_enrollments_user ON public.course_enrollments USING btree (user_id);

CREATE INDEX idx_job_applications_job_id ON public.job_applications USING btree (job_id);

CREATE UNIQUE INDEX lesson_views_user_lesson_unique ON public.lesson_views USING btree (user_id, lesson_id) WHERE (user_id IS NOT NULL);

CREATE INDEX idx_page_views_viewed_at ON public.page_views USING btree (viewed_at);

CREATE INDEX idx_page_views_path ON public.page_views USING btree (path);

CREATE INDEX idx_page_views_article_id ON public.page_views USING btree (article_id);

CREATE INDEX idx_widget_clicks_widget_id ON public.widget_clicks USING btree (widget_id);



-- ======================================================================
-- FUNCTIONS
-- ======================================================================

CREATE OR REPLACE FUNCTION public.articles_set_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = ''
     OR (TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title AND NEW.slug IS NOT DISTINCT FROM OLD.slug) THEN
    NEW.slug := public.unique_article_slug(NEW.title, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_approved_comments(p_article_id uuid)
 RETURNS TABLE(id uuid, article_id uuid, author_name text, content text, is_approved boolean, created_at timestamp with time zone, approved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    ac.id,
    ac.article_id,
    ac.author_name,
    ac.content,
    ac.is_approved,
    ac.created_at,
    ac.approved_at
  FROM public.article_comments ac
  WHERE ac.article_id = p_article_id
    AND ac.is_approved = true
  ORDER BY ac.created_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_daily_views(p_article_id uuid)
 RETURNS TABLE(view_date date, view_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    DATE(pv.viewed_at) as view_date,
    COUNT(*) as view_count
  FROM public.page_views pv
  WHERE pv.article_id = p_article_id
  GROUP BY DATE(pv.viewed_at)
  ORDER BY view_date DESC
  LIMIT 30;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_reaction_counts(p_article_id uuid)
 RETURNS TABLE(likes bigint, dislikes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE reaction_type = 'like')    AS likes,
    COUNT(*) FILTER (WHERE reaction_type = 'dislike') AS dislikes
  FROM public.article_reactions
  WHERE article_id = p_article_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_stats(p_article_id uuid)
 RETURNS TABLE(referrer text, view_count bigint, latest_view timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    COALESCE(pv.referrer, 'ישיר / לא ידוע') as referrer,
    COUNT(*) as view_count,
    MAX(pv.viewed_at) as latest_view
  FROM public.page_views pv
  WHERE pv.article_id = p_article_id
  GROUP BY pv.referrer
  ORDER BY view_count DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_view_counts()
 RETURNS TABLE(article_id uuid, view_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pv.article_id, COUNT(*) as view_count
  FROM public.page_views pv
  WHERE pv.article_id IS NOT NULL
  GROUP BY pv.article_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_course_outline(p_course_id uuid)
 RETURNS TABLE(id uuid, module_id uuid, course_id uuid, title text, description text, duration_minutes integer, is_free boolean, display_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, module_id, course_id, title, description, duration_minutes, is_free, display_order
  FROM public.course_lessons
  WHERE course_id = p_course_id
  ORDER BY display_order NULLS LAST;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_article_reaction(p_article_id uuid, p_session_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT reaction_type
  FROM public.article_reactions
  WHERE article_id = p_article_id
    AND session_id = p_session_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_widget_click_counts()
 RETURNS TABLE(widget_id uuid, click_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wc.widget_id, count(*)::bigint AS click_count
  FROM public.widget_clicks wc
  GROUP BY wc.widget_id
$function$
;

CREATE OR REPLACE FUNCTION public.get_widget_view_counts()
 RETURNS TABLE(widget_id uuid, view_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wi.widget_id, COUNT(*) as view_count
  FROM public.widget_impressions wi
  GROUP BY wi.widget_id;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_course_access(_user_id uuid, _course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.course_enrollments WHERE user_id = _user_id AND course_id = _course_id)
      OR public.has_role(_user_id,'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_course_coupon(p_course_id uuid, p_code text)
 RETURNS TABLE(valid boolean, discount_percent integer, grants_free_access boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.course_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.course_coupons
    WHERE course_id = p_course_id AND lower(code) = lower(trim(p_code))
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, false, 'קוד קופון לא נמצא'::TEXT; RETURN;
  END IF;
  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון אינו פעיל'::TEXT; RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון פג תוקף'::TEXT; RETURN;
  END IF;
  IF c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון מוצה'::TEXT; RETURN;
  END IF;

  UPDATE public.course_coupons SET uses_count = uses_count + 1 WHERE id = c.id;

  RETURN QUERY SELECT true, c.discount_percent, c.grants_free_access, 'קופון מומש'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.slugify_title(_title text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  s text;
BEGIN
  s := coalesce(_title, '');
  s := regexp_replace(s, '[^\w\u0590-\u05FF]+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  s := left(s, 80);
  s := trim(both '-' from s);
  IF s = '' THEN
    s := 'article';
  END IF;
  RETURN s;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_pending_comment(p_article_id uuid, p_author_name text, p_author_email text, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF p_article_id IS NULL OR coalesce(trim(p_author_name),'') = '' OR coalesce(trim(p_content),'') = '' THEN
    RAISE EXCEPTION 'invalid input';
  END IF;
  INSERT INTO public.article_comments(article_id, author_name, author_email, content)
  VALUES (p_article_id, left(p_author_name, 200), nullif(left(p_author_email, 200),''), left(p_content, 5000))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.submit_widget_form(p_widget_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF p_widget_id IS NULL OR p_data IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  INSERT INTO public.widget_form_submissions(widget_id, data)
  VALUES (p_widget_id, p_data) RETURNING id INTO new_id;
  RETURN new_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email text, p_full_name text, p_phone text, p_interest_category text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF coalesce(trim(p_email),'') = '' THEN RAISE EXCEPTION 'invalid email'; END IF;
  INSERT INTO public.newsletter_subscribers(email, full_name, phone, interest_category)
  VALUES (lower(trim(p_email)), left(coalesce(p_full_name,''),200), nullif(left(coalesce(p_phone,''),50),''), left(coalesce(p_interest_category,'כללי'),100))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.toggle_article_reaction(p_article_id uuid, p_session_id text, p_reaction_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing text;
BEGIN
  IF p_reaction_type NOT IN ('like','dislike') THEN
    RAISE EXCEPTION 'invalid reaction_type';
  END IF;

  SELECT reaction_type INTO existing
  FROM public.article_reactions
  WHERE article_id = p_article_id AND session_id = p_session_id
  LIMIT 1;

  IF existing IS NULL THEN
    INSERT INTO public.article_reactions(article_id, session_id, reaction_type)
    VALUES (p_article_id, p_session_id, p_reaction_type);
    RETURN p_reaction_type;
  ELSIF existing = p_reaction_type THEN
    DELETE FROM public.article_reactions
    WHERE article_id = p_article_id AND session_id = p_session_id;
    RETURN NULL;
  ELSE
    DELETE FROM public.article_reactions
    WHERE article_id = p_article_id AND session_id = p_session_id;
    INSERT INTO public.article_reactions(article_id, session_id, reaction_type)
    VALUES (p_article_id, p_session_id, p_reaction_type);
    RETURN p_reaction_type;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unique_article_slug(_title text, _id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  base text := public.slugify_title(_title);
  candidate text := base;
  n int := 1;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.slug = candidate AND (_id IS NULL OR a.id <> _id)
  ) LOOP
    n := n + 1;
    candidate := base || '-' || n::text;
  END LOOP;
  RETURN candidate;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_articles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_courses_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.validate_course_coupon(p_course_id uuid, p_code text)
 RETURNS TABLE(valid boolean, discount_percent integer, grants_free_access boolean, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.course_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.course_coupons
    WHERE course_id = p_course_id AND lower(code) = lower(trim(p_code))
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, false, 'קוד קופון לא נמצא'::TEXT; RETURN;
  END IF;
  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון אינו פעיל'::TEXT; RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון פג תוקף'::TEXT; RETURN;
  END IF;
  IF c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון מוצה'::TEXT; RETURN;
  END IF;

  RETURN QUERY SELECT true, c.discount_percent, c.grants_free_access, 'קופון תקף'::TEXT;
END;
$function$
;



-- ======================================================================
-- TRIGGERS
-- ======================================================================

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

CREATE TRIGGER articles_set_slug_trg BEFORE INSERT OR UPDATE OF title, slug ON public.articles FOR EACH ROW EXECUTE FUNCTION articles_set_slug();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

CREATE TRIGGER update_course_coupons_updated_at BEFORE UPDATE ON public.course_coupons FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();

CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();

CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();



-- The public-schema dump could not see this trigger - it lives on auth.users.
-- Without it handle_new_user never fires and signups get no profile/role row.
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


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



-- #  00000000000001_storage_buckets.sql

-- Storage buckets.
--
-- Buckets live in the storage schema, so they are not part of the public-schema
-- dump. Recreated here from the old project's storage.buckets listing so a fresh
-- environment can be stood up with one `supabase db push`.
--
-- NOTE: the access policies on storage.objects are NOT here yet — they were not
-- captured in the dump. Until they are added, uploads will be rejected even
-- though the buckets exist.

insert into storage.buckets (id, name, public, file_size_limit)
values
  -- Article cover images, served straight to the browser.
  ('article-images', 'article-images', true, null),
  -- Uploaded video, capped at 100 MB.
  ('article-videos', 'article-videos', true, 104857600),
  -- CVs from job applications: personal data, never public.
  ('job-cvs', 'job-cvs', false, null),
  -- Paid course material, gated behind an enrollment check.
  ('course-content', 'course-content', false, null)
on conflict (id) do nothing;


-- #  00000000000002_seed_baseline.sql

-- Baseline rows the site cannot render without.
--
-- This is not sample content — there are no articles here. It is the minimum
-- configuration an empty install needs: without categories the main navigation
-- is empty, and without site_settings the Jobs and Courses sections fall back to
-- hardcoded defaults instead of being controlled from the admin panel.
--
-- Safe to re-run: every statement is idempotent.

-- Categories follow the Agendax beat — hi-tech, AI, companies and markets —
-- rather than the general-news set the site shipped with.
insert into public.categories (name, slug, display_order, is_active)
values
  ('ראשי',            'home',      0, true),
  ('הייטק',           'hightech',  1, true),
  ('בינה מלאכותית',   'ai',        2, true),
  ('חברות',           'companies', 3, true),
  ('שווקים',          'markets',   4, true)
on conflict (slug) do nothing;

insert into public.site_settings (key, value)
values
  ('show_jobs', 'true'::jsonb),
  ('show_courses', 'true'::jsonb)
on conflict (key) do nothing;


-- #  00000000000003_storage_policies.sql

-- Access policies for storage.objects.
--
-- Written from what the application actually does, not recovered from the old
-- project — we are no longer reading anything out of Lovable. Each rule below
-- traces to a specific call site:
--
--   article-images   src/hooks/useImageUpload.ts      admin panel only
--   article-videos   src/hooks/useVideoUpload.ts      admin panel only
--   job-cvs          src/hooks/useJobApplications.ts  public writes, admin reads
--   course-content   (no call site — locked to admins)
--
-- The edge functions that touch storage (ingest-plus-draft) use the service
-- role, which bypasses RLS entirely, so nothing here needs to accommodate them.
--
-- Safe to re-run.

-- A CV is a résumé holding personal data. Cap it so an open upload endpoint
-- cannot be used to push arbitrary large files into the project's storage.
update storage.buckets
set file_size_limit = 10485760  -- 10 MB
where id = 'job-cvs' and file_size_limit is null;

do $$
begin
  -- ---------------------------------------------------------------------
  -- article-images / article-videos — public buckets
  --
  -- Reads already bypass RLS through the public CDN URL; the select policy
  -- below only governs listing through the API. Writes are admin-only: every
  -- upload originates in the admin panel.
  -- ---------------------------------------------------------------------

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Public read of article media') then
    create policy "Public read of article media" on storage.objects
      for select to public
      using (bucket_id in ('article-images', 'article-videos'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Admins upload article media') then
    create policy "Admins upload article media" on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('article-images', 'article-videos')
        and public.has_role(auth.uid(), 'admin')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Admins update article media') then
    create policy "Admins update article media" on storage.objects
      for update to authenticated
      using (
        bucket_id in ('article-images', 'article-videos')
        and public.has_role(auth.uid(), 'admin')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Admins delete article media') then
    create policy "Admins delete article media" on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('article-images', 'article-videos')
        and public.has_role(auth.uid(), 'admin')
      );
  end if;

  -- ---------------------------------------------------------------------
  -- job-cvs — private
  --
  -- Applicants are not signed in, so the insert has to be open to anon. That
  -- is the cost of a public application form; the bucket stays private and the
  -- size limit above bounds the damage. Reads are admin-only, which is also
  -- what makes createSignedUrl work from the admin panel and nowhere else.
  -- ---------------------------------------------------------------------

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Anyone can submit a CV') then
    create policy "Anyone can submit a CV" on storage.objects
      for insert to public
      with check (bucket_id = 'job-cvs');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Admins read CVs') then
    create policy "Admins read CVs" on storage.objects
      for select to authenticated
      using (bucket_id = 'job-cvs' and public.has_role(auth.uid(), 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Admins delete CVs') then
    create policy "Admins delete CVs" on storage.objects
      for delete to authenticated
      using (bucket_id = 'job-cvs' and public.has_role(auth.uid(), 'admin'));
  end if;

  -- ---------------------------------------------------------------------
  -- course-content — private, currently unused
  --
  -- Nothing in the app reads or writes this bucket yet. Admin-only until a
  -- real call site exists: granting enrolled users access now would mean
  -- guessing how course_id ends up in the object path, and a wrong guess here
  -- either breaks delivery or leaks paid material.
  -- ---------------------------------------------------------------------

  if not exists (select 1 from pg_policies where schemaname = 'storage'
                 and policyname = 'Admins manage course content') then
    create policy "Admins manage course content" on storage.objects
      for all to authenticated
      using (bucket_id = 'course-content' and public.has_role(auth.uid(), 'admin'))
      with check (bucket_id = 'course-content' and public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

