-- Three new reader-facing homepage sections, each fed by its own automation:
--   industry_events — conferences scraped daily from IVC / events.co.il /
--     Innovation Authority;
--   daily_briefs — the "5 דברים שצריך לדעת הבוקר" box, written every morning
--     from the last day's articles;
--   funding_deals — the גיוסים-ואקזיטים table, extracted daily from the
--     articles themselves.

create table if not exists public.industry_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  time_label text,
  location text,
  organizer text,
  url text,
  source text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, event_date)
);
create index if not exists idx_industry_events_date on public.industry_events (event_date);

create table if not exists public.daily_briefs (
  brief_date date primary key,
  -- [{ text, article_id?, slug? }]
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.funding_deals (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  kind text not null check (kind in ('funding', 'exit', 'ma', 'ipo')),
  amount_label text,
  round text,
  investors text,
  article_id uuid references public.articles (id) on delete set null,
  announced_on date not null default (timezone('Asia/Jerusalem', now()))::date,
  created_at timestamptz not null default now(),
  unique (company, announced_on, kind)
);
create index if not exists idx_funding_deals_date on public.funding_deals (announced_on desc);

alter table public.industry_events enable row level security;
alter table public.daily_briefs enable row level security;
alter table public.funding_deals enable row level security;

drop policy if exists "Public reads industry events" on public.industry_events;
create policy "Public reads industry events" on public.industry_events
  for select using (is_active);
drop policy if exists "Admins manage industry events" on public.industry_events;
create policy "Admins manage industry events" on public.industry_events
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Public reads daily briefs" on public.daily_briefs;
create policy "Public reads daily briefs" on public.daily_briefs for select using (true);

drop policy if exists "Public reads funding deals" on public.funding_deals;
create policy "Public reads funding deals" on public.funding_deals for select using (true);

-- Conferences refresh once a day, early morning Israel.
do $$ begin perform cron.unschedule('agendax-industry-events'); exception when others then null; end $$;
select cron.schedule(
  'agendax-industry-events',
  '20 3 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/industry-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

-- The morning brief + deal extraction, 06:40 Israel (03:40 UTC) — after the
-- first articles of the day are up, before most readers arrive.
do $$ begin perform cron.unschedule('agendax-morning-brief'); exception when others then null; end $$;
select cron.schedule(
  'agendax-morning-brief',
  '40 3 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/morning-brief',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

-- Gemini's free-tier daily quota resets at 07:00 UTC; a second attempt after
-- the reset covers mornings where the 03:20/03:40 run hit an exhausted quota.
-- Both functions upsert by date/key, so a double run is harmless.
do $$ begin perform cron.unschedule('agendax-industry-events-retry'); exception when others then null; end $$;
select cron.schedule('agendax-industry-events-retry', '5 8 * * *', $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/industry-events',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);

do $$ begin perform cron.unschedule('agendax-morning-brief-retry'); exception when others then null; end $$;
select cron.schedule('agendax-morning-brief-retry', '10 8 * * *', $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/morning-brief',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);
