-- News published on the day it happened.
--
-- The slot allocator handed every new draft the next free half hour after the
-- last one, and rolled to the next day when today filled up — with no limit on
-- how many days ahead the chain could run. The writer produced faster than the
-- day published, so the chain grew: a story from 14/09 sat waiting for a slot
-- on 17/09. Measured lag from the source's publication to ours went 5 hours on
-- 11/09, 28 on 13/09, 76 on 17/09, and was still climbing.
--
-- Three changes, because one alone would not hold:
--   1. nothing is scheduled beyond a horizon — a day that is full stops
--      absorbing work instead of borrowing tomorrow;
--   2. the writer is told the day is full, so it stops writing drafts that
--      would only join the queue;
--   3. a story that went stale while it waited does not publish anyway.

alter table public.ingest_config
  -- How far ahead a draft may be scheduled. Past this the day is full and the
  -- draft stays unscheduled for an editor to decide on.
  add column if not exists schedule_horizon_hours integer not null default 12,
  -- Older than this at its slot, a story is not news any more and is held back.
  add column if not exists max_story_age_hours integer not null default 36;

alter table public.ingest_config drop constraint if exists ingest_config_horizon_chk;
alter table public.ingest_config
  add constraint ingest_config_horizon_chk
  check (schedule_horizon_hours between 1 and 72 and max_story_age_hours between 6 and 168);

-- ---------------------------------------------------------------- 1. horizon
-- Returns null when the next free slot is past the horizon. The worker already
-- treats a null slot as "leave it unscheduled", so nothing else changes.
create or replace function public.next_publish_slot(_step_minutes integer default 30)
returns timestamp with time zone
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  now_il timestamp := timezone('Asia/Jerusalem', now());
  day_start timestamp := date_trunc('day', now_il) + interval '6 hours';
  day_end timestamp := date_trunc('day', now_il) + interval '24 hours';
  horizon integer := coalesce((select schedule_horizon_hours from public.ingest_config limit 1), 12);
  last_il timestamp;
  slot timestamp;
begin
  slot := greatest(now_il, day_start);

  -- Only the chain inside the horizon counts. A row parked further out would
  -- otherwise define the tail forever and the allocator would answer null for
  -- good, which is how one stuck draft could stop all scheduling.
  select max(timezone('Asia/Jerusalem', scheduled_at)) into last_il
  from public.articles
  where scheduled_at is not null
    and timezone('Asia/Jerusalem', scheduled_at) >= day_start
    and scheduled_at <= now() + make_interval(hours => horizon);

  if last_il is not null then
    slot := greatest(slot, last_il + make_interval(mins => _step_minutes));
  end if;

  if slot >= day_end and (last_il is null or last_il < day_end) then
    slot := day_start + interval '1 day';
  end if;

  -- The day is full. Saying so is the point: the chain used to run days ahead
  -- from here, and every article it scheduled aged while it waited.
  if slot > now_il + make_interval(hours => horizon) then
    return null;
  end if;

  return timezone('Asia/Jerusalem', slot);
end;
$function$;

-- ------------------------------------------------------- 2. the stale queue
-- What the old allocator already queued: 21 drafts, on average 84 hours older
-- than the slot waiting for them. They are unscheduled rather than deleted, and
-- carry the reason, so an editor can still publish one by hand if it holds up.
update public.articles
   set scheduled_at = null,
       review_note = left(
         coalesce(review_note || ' · ', '') ||
         'הוסרה מהתזמון: הידיעה הייתה בת יותר מיממה וחצי במועד שנקבע לה',
         800
       )
 where is_draft = true
   and scheduled_at is not null
   and scheduled_at - coalesce(source_published_at, created_at)
       > make_interval(hours => (select max_story_age_hours from public.ingest_config limit 1));

-- --------------------------------------------------------- 3. the publisher
-- Same job as before, plus the freshness gate: a story that aged past the limit
-- while it waited is unscheduled instead of going live as today's news.
do $$ begin perform cron.unschedule('agendax-publish-scheduled'); exception when others then null; end $$;
select cron.schedule(
  'agendax-publish-scheduled',
  '*/5 * * * *',
  $cron$
    -- Too old to run as news by the time its turn comes: hold it back and say
    -- why. Judged against the slot rather than this moment, so a story is
    -- released from the queue as soon as its slot is known to be too late —
    -- not after it has already waited there.
    update public.articles
       set scheduled_at = null,
           review_note = left(
             coalesce(review_note || ' · ', '') ||
             'הוסרה מהתזמון: הידיעה מתיישנת לפני שמגיע תורה',
             800
           )
     where is_draft = true
       and scheduled_at is not null
       and greatest(scheduled_at, now()) - coalesce(source_published_at, created_at)
           > make_interval(hours => (select max_story_age_hours from public.ingest_config limit 1));

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
