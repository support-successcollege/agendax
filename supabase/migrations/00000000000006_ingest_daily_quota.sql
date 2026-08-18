-- Daily quota with automatic replacement.
--
-- Before: each scan queued a fixed 4 stories. If one hit a paywall and failed,
-- the day simply came up short — nothing took its place.
--
-- After: the target is a number of *published drafts per day*, and each scan
-- tops the queue back up toward whatever is still missing, plus a buffer of
-- spares. A story that fails is replaced by the next one in the queue, and the
-- worker stops on its own once the day's target is met, so a quiet day with no
-- failures does not overshoot.

create table if not exists public.ingest_config (
  id boolean primary key default true,
  -- How many drafts the agent should produce per calendar day (Israel time).
  daily_target integer not null default 10,
  -- Spare stories kept queued beyond the remaining target, so a failure has an
  -- immediate replacement instead of waiting for the next scan.
  queue_buffer integer not null default 3,
  lookback_hours integer not null default 24,
  updated_at timestamptz not null default now(),
  -- Single row, enforced by the primary key.
  constraint ingest_config_singleton check (id),
  constraint ingest_config_target_chk check (daily_target between 1 and 50),
  constraint ingest_config_buffer_chk check (queue_buffer between 0 and 20),
  constraint ingest_config_lookback_chk check (lookback_hours between 2 and 96)
);

insert into public.ingest_config (id, daily_target, queue_buffer, lookback_hours)
values (true, 10, 3, 24)
on conflict (id) do nothing;

drop trigger if exists update_ingest_config_updated_at on public.ingest_config;
create trigger update_ingest_config_updated_at
  before update on public.ingest_config
  for each row execute function public.update_articles_updated_at();

-- ---------------------------------------------------------------------------
-- An immutable publish timestamp
-- ---------------------------------------------------------------------------
-- The daily count cannot be derived from updated_at: the update_ingest_items_
-- updated_at trigger rewrites that column on every write, so any later touch of
-- a published row — a backfill, an admin action, a future migration — would
-- silently move that article into a different day and corrupt the count.
-- published_at is written once, by the worker, and nothing rewrites it.
alter table public.ingest_items add column if not exists published_at timestamptz;

update public.ingest_items
   set published_at = updated_at
 where status = 'published' and published_at is null;

create index if not exists idx_ingest_items_published_at
  on public.ingest_items (published_at desc) where status = 'published';

-- ---------------------------------------------------------------------------
-- Where the pipeline stands right now
-- ---------------------------------------------------------------------------
-- "Today" is a calendar day in Israel, not UTC — a run at 01:00 local should
-- count against the new day, which a naive `now() - interval '24 hours'` or a
-- UTC date_trunc would both get wrong.
--
-- Deliberately NOT security definer: RLS on ingest_items/ingest_config already
-- limits this to admins, and the Edge Functions use the service role, which
-- bypasses RLS anyway.
create or replace function public.ingest_daily_stats()
returns table (
  published_today integer,
  queued integer,
  daily_target integer,
  queue_buffer integer,
  lookback_hours integer
)
language sql
stable
set search_path to 'public'
as $function$
  select
    (select count(*)::integer
       from public.ingest_items
      where status = 'published'
        and published_at >= (date_trunc('day', timezone('Asia/Jerusalem', now())) at time zone 'Asia/Jerusalem')),
    (select count(*)::integer
       from public.ingest_items
      where status in ('pending', 'processing')),
    c.daily_target,
    c.queue_buffer,
    c.lookback_hours
  from public.ingest_config c
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ingest_config enable row level security;

drop policy if exists "Admins manage ingest config" on public.ingest_config;
create policy "Admins manage ingest config" on public.ingest_config
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- Scan more often, so a failure is replaced within hours rather than next day
-- ---------------------------------------------------------------------------
-- Six scans instead of three. Each one only tops the queue up to what is still
-- missing from the daily target, so more frequent scanning does not mean more
-- articles — it means failures get replaced sooner and the day's output is
-- spread out instead of arriving in three lumps.
do $$
begin
  perform cron.unschedule('agendax-ingest-scan');
exception when others then null;
end $$;

select cron.schedule(
  'agendax-ingest-scan',
  '0 2,6,10,14,18,22 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-global-tech',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
