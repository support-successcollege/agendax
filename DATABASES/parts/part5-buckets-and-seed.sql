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
