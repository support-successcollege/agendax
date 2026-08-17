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
