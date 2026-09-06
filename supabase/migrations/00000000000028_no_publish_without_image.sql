-- No article goes live carrying a photo that has nothing to do with it.
--
-- The worker's image chain is source photo -> Gemini -> a generic stock image.
-- That last step was silent: an article whose image generation failed went live
-- looking deliberate, illustrated by a stranger's laptop. Two changes close it:
-- the publish cron now refuses those articles, and a sweep gives them a real
-- image within minutes so the refusal is a delay, never a dead end.

-- ---------------------------------------------------------------------------
-- 1. The publish gate
-- ---------------------------------------------------------------------------
do $$ begin perform cron.unschedule('agendax-publish-scheduled'); exception when others then null; end $$;

select cron.schedule(
  'agendax-publish-scheduled',
  '*/5 * * * *',
  $cron$
    update public.articles
       set is_draft = false,
           published_at = scheduled_at,
           date = (timezone('Asia/Jerusalem', scheduled_at))::date
     where is_draft = true
       and scheduled_at is not null
       and scheduled_at <= now()
       -- An article without an image of its own waits. The sweep below is what
       -- ends the wait; a blocked article keeps its past slot and goes live on
       -- the next tick after it gets a picture.
       and coalesce(image_url, '') <> ''
       and image_url not like '%photo-1504711434969-e33886168f5c%';
  $cron$
);

-- ---------------------------------------------------------------------------
-- 2. The sweep that clears the gate
-- ---------------------------------------------------------------------------
-- One article per run: the function walks a chain of image models and a single
-- article can take ~40s. Every 5 minutes is far faster than the ~3 articles a
-- day that actually need it.
do $$ begin perform cron.unschedule('agendax-article-image'); exception when others then null; end $$;

select cron.schedule(
  'agendax-article-image',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/article-image',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{"sweep": true}'::jsonb,
      timeout_milliseconds := 200000
    );
  $cron$
);
