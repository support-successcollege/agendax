-- Social publishing from the panel: connected accounts (credentials the admin
-- pastes in, admin-RLS), a ledger of what was posted where, and an
-- auto-publish cron so the system posts on its own.
create table if not exists public.social_accounts (
  platform text primary key
    check (platform in ('facebook', 'instagram', 'linkedin', 'x')),
  enabled boolean not null default false,
  -- When on, newly published articles are posted to this platform by the cron
  -- without anyone pressing a button.
  auto_publish boolean not null default false,
  -- Tokens and ids, shaped per platform (page_id/access_token, ig_user_id,
  -- author urn...). Admin-only via RLS; the edge function reads with the
  -- service role.
  credentials jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  platform text not null,
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'failed')),
  external_id text,
  post_text text,
  error text,
  created_at timestamptz not null default now(),
  -- One post per article per platform: the auto cron's idempotency key.
  unique (article_id, platform)
);

create index if not exists idx_social_posts_created
  on public.social_posts (created_at desc);

alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;

drop policy if exists "Admins manage social accounts" on public.social_accounts;
create policy "Admins manage social accounts" on public.social_accounts
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage social posts" on public.social_posts;
create policy "Admins manage social posts" on public.social_posts
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- Auto-publish sweep: every 20 minutes, post fresh published articles to the
-- platforms whose auto_publish is on. The function no-ops instantly when no
-- platform has auto on.
do $$
begin
  perform cron.unschedule('agendax-social-publish');
exception when others then null;
end $$;

select cron.schedule(
  'agendax-social-publish',
  '*/20 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/social-publish',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{"auto": true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);
