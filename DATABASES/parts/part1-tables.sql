set search_path = public;

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



