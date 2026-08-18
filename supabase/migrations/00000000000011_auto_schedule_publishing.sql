-- Articles the agent writes are no longer published by hand: each new draft
-- takes the next free slot in the day's publishing window (06:00–24:00 Israel
-- time), and a cron flips due drafts live. The feed fills steadily through the
-- day instead of in bursts, and the editor keeps a veto window — a scheduled
-- draft can still be edited or deleted until its slot arrives.

-- ---------------------------------------------------------------------------
-- Next free publishing slot
-- ---------------------------------------------------------------------------
-- Slots stack: each call returns max(now, 06:00, last slot + step), clamped to
-- the window; when today's window is full the chain rolls into tomorrow 06:00.
-- All day math runs in Israel local time inside Postgres — the caller never
-- guesses the UTC offset (which flips twice a year with DST).
create or replace function public.next_publish_slot(_step_minutes integer default 30)
returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  now_il timestamp := timezone('Asia/Jerusalem', now());
  day_start timestamp := date_trunc('day', now_il) + interval '6 hours';
  day_end timestamp := date_trunc('day', now_il) + interval '24 hours';
  last_il timestamp;
  slot timestamp;
begin
  slot := greatest(now_il, day_start);

  select max(timezone('Asia/Jerusalem', scheduled_at)) into last_il
  from public.articles
  where scheduled_at is not null
    and timezone('Asia/Jerusalem', scheduled_at) >= day_start;

  if last_il is not null then
    slot := greatest(slot, last_il + make_interval(mins => _step_minutes));
  end if;

  if slot >= day_end and (last_il is null or last_il < day_end) then
    -- Today's window is full: roll into tomorrow's.
    slot := day_start + interval '1 day';
  end if;

  return timezone('Asia/Jerusalem', slot);
end;
$function$;

-- ---------------------------------------------------------------------------
-- The publisher: due drafts go live
-- ---------------------------------------------------------------------------
-- published_at takes the slot time, not now(), so the feed keeps the intended
-- order even when one cron tick publishes several due drafts at once.
do $$
begin
  perform cron.unschedule('agendax-publish-scheduled');
exception when others then null;
end $$;

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
       and scheduled_at <= now();
  $cron$
);
