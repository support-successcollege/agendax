-- Google gets the sitemaps and the day's fresh article URLs once a day,
-- automatically, an hour after the morning rebuild — the admin button stays
-- for manual pushes. The function no-ops harmlessly (500, logged) until
-- GOOGLE_SERVICE_ACCOUNT_KEY is configured.
do $$
begin
  perform cron.unschedule('agendax-sitemap-submit');
exception when others then null;
end $$;

select cron.schedule(
  'agendax-sitemap-submit',
  '10 4 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/submit-sitemap',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
