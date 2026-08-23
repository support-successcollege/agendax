-- Social publishing moves from "every published article goes out at once" to
-- a managed queue: the admin sets how many posts a day and at what hours,
-- the system fills those slots with the best fresh articles, and the team can
-- add, move, cancel or re-target items (post or story) from the panel.

-- One row of settings, id = 1.
create table if not exists public.social_settings (
  id int primary key default 1 check (id = 1),
  -- Daily cap of auto-filled posts (manual items count toward it too).
  posts_per_day int not null default 3 check (posts_per_day between 0 and 24),
  -- "HH:MM" in Israel time; the slots the auto-fill uses, in order.
  publish_hours text[] not null default array['09:00', '13:00', '19:00'],
  -- Off = nothing is queued by itself; only what the team adds goes out.
  auto_fill boolean not null default true,
  -- On = every auto-filled post also gets a story (Facebook / Instagram).
  auto_stories boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.social_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.social_queue (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  -- Which networks this item goes to; each is validated against social_accounts at run time.
  platforms text[] not null default array['facebook', 'instagram', 'linkedin', 'x'],
  kind text not null default 'post' check (kind in ('post', 'story')),
  scheduled_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'publishing', 'posted', 'failed', 'cancelled')),
  source text not null default 'manual' check (source in ('auto', 'manual')),
  -- Per-platform outcome of the run: [{platform, ok, error?}]
  result jsonb,
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_social_queue_due
  on public.social_queue (status, scheduled_at);
create index if not exists idx_social_queue_article
  on public.social_queue (article_id);

alter table public.social_settings enable row level security;
alter table public.social_queue enable row level security;

drop policy if exists "Admins manage social settings" on public.social_settings;
create policy "Admins manage social settings" on public.social_settings
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage social queue" on public.social_queue;
create policy "Admins manage social queue" on public.social_queue
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- The sweep now runs every 5 minutes so queued times are honoured closely:
-- it fills free slots for today/tomorrow and publishes everything that is due.
do $$ begin perform cron.unschedule('agendax-social-publish'); exception when others then null; end $$;
select cron.schedule(
  'agendax-social-publish',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/social-publish',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{"auto": true}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$
);
