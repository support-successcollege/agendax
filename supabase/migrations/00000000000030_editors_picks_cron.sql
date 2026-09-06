-- Builds tomorrow's "בחירת העורכים" before anyone is reading: 05:40 Israel,
-- after the night's ingest has run and before the morning traffic starts.
-- The function is idempotent, so a retry or a double fire changes nothing.
do $$ begin perform cron.unschedule('agendax-editors-picks'); exception when others then null; end $$;

select cron.schedule(
  'agendax-editors-picks',
  '40 2 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/editors-picks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 180000
    );
  $cron$
);
