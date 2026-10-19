-- A hit carousel must go out while its story is still fresh.
--
-- social-publish cancels anything older than ingest_config.max_story_age_hours
-- (24) at its slot, judged by source_published_at (or published_at for a piece
-- written here). On 19/10/2026 hit_studio_advance queued three carousels on
-- the next free hit slot without asking that question; all three were 25-56
-- hours old by their slot and would be cancelled at the door. A slot is now
-- taken only if the story will still be inside the limit (minus an hour of
-- margin); a pick with no such slot is skipped, with the reason recorded.

create or replace function public.hit_studio_advance()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  s        record;
  p        record;
  v_secret text;
  v_try    timestamptz;
  v_slot   timestamptz;
  v_qid    uuid;
  v_day    date;
  v_h      text;
  v_max    interval;
  v_ticks  int := 0;
  v_queued int := 0;
  v_skip   int := 0;
begin
  select * into s from public.growth_settings where id = 1;
  if not found or not s.hits_enabled then
    return jsonb_build_object('skipped', true);
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_cron_secret';
  select make_interval(hours => greatest(coalesce(max(max_story_age_hours), 24) - 1, 1))
    into v_max from public.ingest_config;

  -- 1. A carousel still generating gets one tick, spaced out.
  for p in
    select h.id, h.carousel_id
    from public.hit_picks h
    join public.social_carousels c on c.id = h.carousel_id
    where h.status = 'carousel' and c.status = 'generating'
      and (h.last_tick_at is null or h.last_tick_at < now() - interval '3 minutes')
  loop
    perform net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/social-carousel',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-secret', v_secret),
      body := jsonb_build_object('action', 'tick', 'id', p.carousel_id),
      timeout_milliseconds := 150000
    );
    update public.hit_picks set last_tick_at = now(), updated_at = now() where id = p.id;
    v_ticks := v_ticks + 1;
  end loop;

  -- 2. A carousel that failed fails its pick.
  update public.hit_picks h
     set status = 'failed', error = coalesce(c.error, 'הקרוסלה נכשלה'), updated_at = now()
    from public.social_carousels c
   where c.id = h.carousel_id and h.status = 'carousel' and c.status = 'failed';

  -- 3. A ready carousel goes on the next free hit slot where the story is
  --    still fresh enough for social-publish to send it.
  for p in
    select h.id, h.article_id, h.carousel_id,
           coalesce(a.source_published_at, a.published_at, h.created_at) as born
    from public.hit_picks h
    join public.social_carousels c on c.id = h.carousel_id
    join public.articles a on a.id = h.article_id
    where h.status = 'carousel' and c.status = 'ready'
    order by h.score desc, h.created_at
  loop
    if not s.auto_queue_hits then
      update public.hit_picks set status = 'ready', updated_at = now() where id = p.id;
      continue;
    end if;

    v_slot := null;
    for i in 0..1 loop
      v_day := (now() at time zone 'Asia/Jerusalem')::date + i;
      foreach v_h in array s.hit_slots loop
        v_try := (v_day + v_h::time)::timestamp at time zone 'Asia/Jerusalem';
        if v_try > now() + interval '10 minutes'
           and v_try - p.born <= v_max
           and not exists (
             select 1 from public.social_queue q
             where q.status <> 'cancelled' and q.kind <> 'story'
               and abs(extract(epoch from (q.scheduled_at - v_try))) < 1200
           ) then
          v_slot := v_try;
          exit;
        end if;
      end loop;
      exit when v_slot is not null;
    end loop;

    if v_slot is null then
      -- No hit slot left inside the freshness limit: it would be cancelled at
      -- the door. Say so instead of retrying forever.
      if now() + interval '10 minutes' - p.born > v_max or
         not exists (
           select 1 from unnest(s.hit_slots) hs,
                generate_series(0, 1) d
           where ((((now() at time zone 'Asia/Jerusalem')::date + d) + hs::time)::timestamp at time zone 'Asia/Jerusalem') - p.born <= v_max
             and ((((now() at time zone 'Asia/Jerusalem')::date + d) + hs::time)::timestamp at time zone 'Asia/Jerusalem') > now() + interval '10 minutes'
         ) then
        update public.hit_picks
           set status = 'skipped', error = 'הידיעה תהיה ישנה מדי בשעת הלהיט הבאה', updated_at = now()
         where id = p.id;
        v_skip := v_skip + 1;
      end if;
      continue;  -- otherwise the fresh slots are just taken right now; try next run
    end if;

    insert into public.social_queue (article_id, platforms, kind, carousel_id, scheduled_at, status, source)
    values (p.article_id, s.hit_platforms, 'carousel', p.carousel_id, v_slot, 'queued', 'auto')
    returning id into v_qid;

    update public.hit_picks
       set status = 'queued', queue_id = v_qid, scheduled_at = v_slot, updated_at = now()
     where id = p.id;
    v_queued := v_queued + 1;
  end loop;

  -- 4. Follow the queue item to the end.
  update public.hit_picks h
     set status = case q.status when 'posted' then 'posted' else 'failed' end,
         posted_at = q.posted_at,
         error = case when q.status = 'posted' then null else coalesce(q.error, 'בוטל בתור') end,
         updated_at = now()
    from public.social_queue q
   where q.id = h.queue_id and h.status = 'queued' and q.status in ('posted', 'failed', 'cancelled');

  return jsonb_build_object('ticks', v_ticks, 'queued', v_queued, 'skipped', v_skip);
end
$fn$;

revoke all on function public.hit_studio_advance() from public, anon, authenticated;
grant execute on function public.hit_studio_advance() to service_role;
