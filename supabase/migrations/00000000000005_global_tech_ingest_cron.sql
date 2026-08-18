-- Schedules the global hi-tech pipeline.
--
--   scan   — three times a day, fills the queue with 4 ranked stories
--   worker — every 5 minutes, drains one story from the queue
--
-- Times are UTC, which is what pg_cron uses. Israel is UTC+3 in summer and
-- UTC+2 in winter, so 03:00 / 10:00 / 17:00 UTC lands on 06:00 / 13:00 / 20:00
-- Israel time between March and October, and an hour earlier in winter. Shift
-- the hours by one in the winter if the exact local hour matters.
--
-- The shared secret lives in Supabase Vault, never in this file. The DO block
-- below mints a random one on first run; read it back and hand the same value
-- to the Edge Functions:
--
--   select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret';
--   supabase secrets set INGEST_CRON_SECRET=<that value>

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ingest_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'ingest_cron_secret',
      'Shared secret pg_cron sends to the ingest Edge Functions'
    );
    raise notice 'created vault secret ingest_cron_secret — run: select decrypted_secret from vault.decrypted_secrets where name = ''ingest_cron_secret'';';
  end if;
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise warning 'supabase_vault is not available — create the secret manually and edit the cron jobs';
end $$;

-- Re-running the migration should not stack duplicate jobs.
do $$
begin
  perform cron.unschedule('agendax-ingest-scan');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('agendax-ingest-worker');
exception when others then null;
end $$;

select cron.schedule(
  'agendax-ingest-scan',
  '0 3,10,17 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-global-tech',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := jsonb_build_object('limit', 4),
      timeout_milliseconds := 60000
    );
  $cron$
);

-- The worker is intentionally chatty: an empty queue costs one indexed SELECT
-- and returns in milliseconds, and this way a story that failed on its first
-- attempt gets retried within minutes instead of waiting for the next scan.
select cron.schedule(
  'agendax-ingest-worker',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := jsonb_build_object('max', 1),
      timeout_milliseconds := 30000
    );
  $cron$
);
