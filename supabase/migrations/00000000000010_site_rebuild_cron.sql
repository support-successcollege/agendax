-- The static prerender (article HTML, sitemap, news-sitemap) only refreshes
-- when Vercel builds, and Vercel only builds on push. This job hits the
-- project's Deploy Hook an hour after each scan wave, so articles the agent
-- published get real prerendered pages the same day without anyone pushing.
--
-- The hook URL is not an API key — it can only trigger a build of this one
-- project — so it lives here rather than in Vault.
do $$
begin
  perform cron.unschedule('agendax-site-rebuild');
exception when others then null;
end $$;

select cron.schedule(
  'agendax-site-rebuild',
  '0 3,7,11,15,19,23 * * *',
  $cron$
    select net.http_post(
      url := 'https://api.vercel.com/v1/integrations/deploy/prj_GlLbmD5Jcm5IBIhXysVaP6SPi3Gx/uLjJKMFkjD',
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$
);
