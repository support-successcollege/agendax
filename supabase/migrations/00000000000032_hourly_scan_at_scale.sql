-- Scaling the scan to ~1000 feeds, run every hour on the last hour of news.
--
-- Three parts:
--   1. one statement instead of a thousand round-trips for the per-source
--      status write;
--   2. a one-hour window, which only makes sense if the scan runs hourly —
--      a 1h window on a 4h cron would miss three hours of news in four;
--   3. the hourly cron itself.

-- ---------- 1. Batched source status ----------
-- The scanner used to await one UPDATE per source inside its loop. At 200
-- sources that was tolerable; at 1000 it costs more wall clock than fetching
-- the feeds, against a 150s request limit.
create or replace function public.touch_news_sources(_updates jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  touched integer;
begin
  with input as (
    select
      (u->>'id')::uuid            as id,
      u->>'last_status'           as last_status,
      (u->>'last_item_count')::int as last_item_count,
      nullif(u->>'first_failed_at', '')::timestamptz as first_failed_at,
      coalesce((u->>'deactivate')::boolean, false)   as deactivate
    from jsonb_array_elements(_updates) u
  )
  update public.news_sources s
     set last_fetched_at  = now(),
         last_status      = i.last_status,
         last_item_count  = i.last_item_count,
         first_failed_at  = i.first_failed_at,
         is_active        = case when i.deactivate then false else s.is_active end,
         auto_disabled_at = case when i.deactivate then now() else s.auto_disabled_at end,
         updated_at       = now()
    from input i
   where s.id = i.id;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.touch_news_sources(jsonb) from public, anon, authenticated;

-- ---------- 2. One hour of news ----------
-- The old floor of two hours encoded the old four-hourly schedule. An hourly
-- pass on a one-hour window is the whole point of the change, so the floor
-- drops to one.
alter table public.ingest_config drop constraint if exists ingest_config_lookback_chk;
alter table public.ingest_config
  add constraint ingest_config_lookback_chk
  check (lookback_hours >= 1 and lookback_hours <= 96);

-- Only stories published in the last hour are eligible. The lag escalation
-- (a category behind quota widens the window) still applies on top of this.
update public.ingest_config set lookback_hours = 1;

-- ---------- 3. Hourly scan ----------
-- A one-hour window demands an hourly pass: at the old six-a-day schedule the
-- system would look at one hour in four and never see the other three.
do $$ begin perform cron.unschedule('agendax-ingest-scan'); exception when others then null; end $$;
select cron.schedule(
  'agendax-ingest-scan',
  '2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-global-tech',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$
);
