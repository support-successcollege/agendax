-- The weekly newsletter: every Friday morning, the week's most-read stories
-- go to every active subscriber.
--
-- Until now the newsletter was only ever sent by hand from the admin tab (four
-- sends, all tests, in August). Signups now come from the box inside every
-- story, and a signup that never hears back is a lost reader.
--
-- send-newsletter already does the composing, the per-recipient unsubscribe
-- link and the send log; it accepts the cron secret. This migration only picks
-- the stories and calls it on a schedule.

-- 1. The picks: the week's six most-read published stories (distinct visitors,
--    bots excluded), topped up with the freshest of the week when fewer than
--    six were read. Only stories with an image, so every card in the email has
--    a picture. Returns the request body for send-newsletter, so the same
--    payload can be inspected or sent as a test.
create or replace function public.newsletter_weekly_payload(p_test_email text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with week as (
    select a.id, a.title, a.published_at,
           count(distinct pv.visitor_id) as readers
    from public.articles a
    left join public.page_views pv
      on pv.article_id = a.id
     and pv.viewed_at > now() - interval '7 days'
     and coalesce(pv.user_agent, '') !~* 'bot|crawl|spider|preview|headless|lighthouse|facebookexternalhit|whatsapp/'
    where not a.is_draft
      and a.published_at > now() - interval '7 days'
      and coalesce(a.image_url, '') <> ''
    group by a.id, a.title, a.published_at
  ),
  picks as (
    select id, title
    from week
    order by readers desc, published_at desc
    limit 6
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'subject', 'השבוע ב-AgendaX: ' || left((select title from picks limit 1), 70),
    'intro', 'הכתבות שהכי נקראו השבוע באתר: הייטק, AI, שוק ההון וקריירה. קריאה נעימה ושבת שלום.',
    'articleIds', (select jsonb_agg(id) from picks),
    'testEmail', p_test_email
  ))
  where exists (select 1 from picks);
$$;

revoke all on function public.newsletter_weekly_payload(text) from public, anon, authenticated;

-- 2. The send. Does nothing when there is no story to send or no active
--    subscriber, so an empty week never produces an error mail or a log row.
create or replace function public.newsletter_weekly_send()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb := public.newsletter_weekly_payload(null);
begin
  if payload is null then
    return null;
  end if;
  if not exists (select 1 from public.newsletter_subscribers where is_active) then
    return null;
  end if;
  return net.http_post(
    url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/send-newsletter',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
    ),
    body := payload,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.newsletter_weekly_send() from public, anon, authenticated;

-- 3. Fridays at 06:00 UTC: 08:00 in Israel in winter, 09:00 in summer.
select cron.unschedule('agendax-weekly-newsletter')
where exists (select 1 from cron.job where jobname = 'agendax-weekly-newsletter');

select cron.schedule(
  'agendax-weekly-newsletter',
  '0 6 * * 5',
  $cron$ select public.newsletter_weekly_send(); $cron$
);
