-- Keeping the archive at 100% without anyone watching.
--
-- Two jobs, because scoring and repairing cost different things. Scoring is
-- string length and a few regexes over articles nobody has checked yet, so it
-- runs often and sweeps the whole backlog. Repairing spends a model call per
-- article, so it takes a few at a time, worst first, and works down the list
-- over hours instead of in one burst that would empty a daily quota.

-- Every new article is scored within the hour it goes live.
do $$ begin perform cron.unschedule('agendax-quality-scan'); exception when others then null; end $$;
select cron.schedule(
  'agendax-quality-scan',
  '25 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/article-quality',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{"action": "scan", "limit": 200}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$
);

-- One repair per run, three times an hour. A repair measures 60-90 seconds —
-- a rewrite, often a review, sometimes an image — so two in one request would
-- outrun it; running more often costs nothing and keeps each request short.
-- Three an hour clears a 300-article backlog in about four days without ever
-- competing with the writer for the day's model quota.
do $$ begin perform cron.unschedule('agendax-quality-fix'); exception when others then null; end $$;
select cron.schedule(
  'agendax-quality-fix',
  '10,30,50 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/article-quality',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{"action": "sweep", "max": 1}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$
);
