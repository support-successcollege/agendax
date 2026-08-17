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
