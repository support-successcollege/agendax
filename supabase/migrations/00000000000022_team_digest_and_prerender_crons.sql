-- 1) The team's daily publishing schedule email — 07:30 Israel (04:30 UTC).
do $$ begin perform cron.unschedule('agendax-team-digest'); exception when others then null; end $$;
select cron.schedule(
  'agendax-team-digest',
  '30 4 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/team-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

-- 2) Pre-render the post + story images ahead of time, so the links in the
--    digest resolve by the time the team needs them: every 30 minutes, for
--    articles going live in the next ~90 minutes (and anything that just went
--    live). social-image returns the cached file instantly when it exists.
do $$ begin perform cron.unschedule('agendax-social-prerender'); exception when others then null; end $$;
select cron.schedule(
  'agendax-social-prerender',
  '5,35 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/social-image',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := jsonb_build_object('articleId', a.id, 'variant', v.variant),
      timeout_milliseconds := 90000
    )
    from public.articles a
    cross join (values ('post'), ('story')) as v(variant)
    where a.category_slug <> 'marketing'
      and (
        (a.is_draft and a.scheduled_at between now() and now() + interval '95 minutes')
        or (not a.is_draft and a.published_at > now() - interval '40 minutes')
      )
    limit 40;
  $cron$
);
