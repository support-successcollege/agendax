-- The writer's cron waited 30 seconds for a job that takes two minutes.
--
-- Writing one article is a model call, a sub-editor pass and an image, and a
-- measured run takes about 120 seconds. pg_net gave up at 30, so every run
-- recorded a dead row in net._http_response with no status and no body: the
-- article was still written (the function keeps running after the caller hangs
-- up), but whether it succeeded, what it created, and any note it returned were
-- all invisible. A failing writer would have looked exactly like a working one.

do $$ begin perform cron.unschedule('agendax-ingest-worker'); exception when others then null; end $$;
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
      timeout_milliseconds := 150000
    );
  $cron$
);
