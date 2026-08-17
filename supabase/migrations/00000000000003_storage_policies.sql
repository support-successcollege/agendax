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
