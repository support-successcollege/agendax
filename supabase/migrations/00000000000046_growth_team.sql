-- צוות הצמיחה: צייד להיטים, סטודיו להיטים ומדידה בלי בוטים.
--
-- Why: in the 30 days to 18/10/2026 two articles that got a carousel brought
-- 30% of all page views (575 and 218), while a regular article got 3-5 and a
-- quarter got none. Volume does not bring readers; a pushed hit does. This
-- turns that one accident into a daily routine:
--   hit-scout (Edge Function, cron)  → picks 1-2 articles, starts a carousel
--   hit_studio_advance() (cron)      → ticks the carousel until ready, queues it
--                                       on a hit slot, follows it to "posted"
--   human_page_views / growth_weekly_report() → the numbers without bots,
--                                       for the analyst and the morning brief

-- ---------------------------------------------------------------- settings
create table if not exists public.growth_settings (
  id int primary key default 1 check (id = 1),
  hits_enabled boolean not null default true,
  hits_per_day int not null default 2 check (hits_per_day between 0 and 5),
  hit_min_score int not null default 7 check (hit_min_score between 1 and 10),
  -- true: a ready hit carousel goes straight into the social queue.
  -- false: it waits with status 'ready' for a human to queue it.
  auto_queue_hits boolean not null default true,
  -- Israel time. Off the regular grid on purpose, so a hit never fights the
  -- auto-fill for a slot; both sit next to the peak hours (13, 19-21).
  hit_slots text[] not null default array['12:15', '20:15'],
  hit_platforms text[] not null default array['facebook', 'instagram'],
  updated_at timestamptz not null default now()
);
insert into public.growth_settings (id) values (1) on conflict (id) do nothing;
alter table public.growth_settings enable row level security;
comment on table public.growth_settings is $c$הגדרות צוות הצמיחה: כמה להיטים ביום, ציון מינימום, האם להכניס לתור אוטומטית, ושעות הלהיטים (שעון ישראל).$c$;

-- ---------------------------------------------------------------- DM join button
-- A third button on the comment-to-DM reply: the newsletter / WhatsApp signup.
-- Empty url = no button (the default; set it to switch the button on).
alter table public.social_settings add column if not exists dm_join_url text not null default '';
alter table public.social_settings add column if not exists dm_join_button_label text not null default '';

-- ---------------------------------------------------------------- hit picks
create table if not exists public.hit_picks (
  id uuid primary key default gen_random_uuid(),
  pick_date date not null,
  article_id uuid not null references public.articles(id) on delete cascade,
  score int not null,
  angle text,
  reason text,
  -- picked → carousel → (ready) → queued → posted | failed | skipped
  status text not null default 'picked'
    check (status in ('picked', 'carousel', 'ready', 'queued', 'posted', 'failed', 'skipped')),
  carousel_id uuid references public.social_carousels(id) on delete set null,
  queue_id uuid references public.social_queue(id) on delete set null,
  scheduled_at timestamptz,
  posted_at timestamptz,
  last_tick_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id)
);
create index if not exists hit_picks_date_idx on public.hit_picks (pick_date);
create index if not exists hit_picks_status_idx on public.hit_picks (status) where status in ('picked', 'carousel', 'ready', 'queued');
alter table public.hit_picks enable row level security;
comment on table public.hit_picks is $c$הלהיטים שצייד הלהיטים בחר: ציון, זווית, והמסלול שלהם עד פרסום כקרוסלה.$c$;

-- ---------------------------------------------------------------- human views
-- About a third of page_views are crawlers and link previews. Every growth
-- number reads from here.
create or replace view public.human_page_views
with (security_invoker = true) as
select *
from public.page_views
where user_agent is not null
  and user_agent !~* '(bot|crawl|spider|preview|facebookexternalhit|slurp|headless|lighthouse|python|curl|wget|httpclient|monitor)';
comment on view public.human_page_views is $c$צפיות של בני אדם בלבד: page_views בלי בוטים, סורקים ותצוגות מקדימות של קישורים.$c$;

create or replace function public.top_articles_human(p_days int default 30, p_limit int default 8)
returns table (title text, views bigint)
language sql stable
set search_path = public, pg_temp
as $fn$
  select a.title, count(*) as views
  from public.human_page_views p
  join public.articles a on a.id = p.article_id
  where p.viewed_at > now() - make_interval(days => p_days)
  group by a.title
  order by views desc
  limit p_limit;
$fn$;

-- ---------------------------------------------------------------- weekly report
create or replace function public.growth_weekly_report()
returns jsonb
language sql stable
set search_path = public, pg_temp
as $fn$
  with pv as (
    select p.*, lower(coalesce(substring(p.referrer from '^https?://([^/]+)'), '(ישיר)')) as host
    from public.human_page_views p
    where p.viewed_at > now() - interval '14 days'
  ),
  wk as (select * from pv where viewed_at > now() - interval '7 days'),
  prev as (select * from pv where viewed_at <= now() - interval '7 days'),
  pub as (
    select a.id, a.title, (h.article_id is not null) as is_hit,
           (select count(*) from wk where wk.article_id = a.id) as views
    from public.articles a
    left join public.hit_picks h on h.article_id = a.id
    where not a.is_draft and a.published_at > now() - interval '7 days'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'views_7d', (select count(*) from wk),
    'readers_7d', (select count(distinct visitor_id) from wk),
    'views_prev_7d', (select count(*) from prev),
    'readers_prev_7d', (select count(distinct visitor_id) from prev),
    'sources_7d', (select coalesce(jsonb_agg(x), '[]') from (
        select case
                 when host like '%facebook%' then 'פייסבוק'
                 when host like '%instagram%' then 'אינסטגרם'
                 when host like '%linkedin%' or host = 'lnkd.in' then 'לינקדאין'
                 when host like '%google%' then 'גוגל'
                 when host like '%agendax%' then 'מתוך האתר'
                 when host = '(ישיר)' then 'ישיר'
                 else 'אחר'
               end as source,
               count(*) as views
        from wk group by 1 order by 2 desc) x),
    'top_articles_7d', (select coalesce(jsonb_agg(x), '[]') from (
        select a.title, count(*) as views, (h.id is not null) as was_hit
        from wk join public.articles a on a.id = wk.article_id
        left join public.hit_picks h on h.article_id = a.id
        group by a.title, h.id order by views desc limit 10) x),
    'hits_7d', (select coalesce(jsonb_agg(x order by x.pick_date desc), '[]') from (
        select h.pick_date, a.title, h.score, h.status, h.scheduled_at, h.posted_at,
               (select count(*) from public.human_page_views p
                 where p.article_id = h.article_id and p.viewed_at >= coalesce(h.posted_at, h.created_at)) as views_since
        from public.hit_picks h join public.articles a on a.id = h.article_id
        where h.pick_date > current_date - 7) x),
    'avg_views_hit', (select round(avg(views), 1) from pub where is_hit),
    'avg_views_regular', (select round(avg(views), 1) from pub where not is_hit),
    'published_7d', (select count(*) from pub),
    'zero_view_articles_7d', (select count(*) from pub where views = 0),
    'newsletter_subscribers', (select count(*) from public.newsletter_subscribers),
    'social_posts_7d', (select coalesce(jsonb_object_agg(platform, n), '{}') from (
        select platform, count(*) as n from public.social_posts
        where status = 'posted' and created_at > now() - interval '7 days' group by 1) x),
    'social_failed_7d', (select count(*) from public.social_posts where status = 'failed' and created_at > now() - interval '7 days'),
    'dm_sent_7d', (select count(*) from public.social_automation_events where sent and created_at > now() - interval '7 days')
  );
$fn$;

-- ---------------------------------------------------------------- hit studio
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
  v_ticks  int := 0;
  v_queued int := 0;
begin
  select * into s from public.growth_settings where id = 1;
  if not found or not s.hits_enabled then
    return jsonb_build_object('skipped', true);
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_cron_secret';

  -- 1. A carousel still generating gets one tick. A tick does one heavy step
  --    (a background or a slide render), so it is spaced out: two ticks on the
  --    same carousel at once would race on its slides.
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

  -- 3. A ready carousel goes on the next free hit slot (today or tomorrow).
  for p in
    select h.id, h.article_id, h.carousel_id
    from public.hit_picks h
    join public.social_carousels c on c.id = h.carousel_id
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
    continue when v_slot is null;  -- both days full; the next run tries again

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

  return jsonb_build_object('ticks', v_ticks, 'queued', v_queued);
end
$fn$;

-- ---------------------------------------------------------------- permissions
revoke all on function public.top_articles_human(int, int) from public, anon, authenticated;
revoke all on function public.growth_weekly_report() from public, anon, authenticated;
revoke all on function public.hit_studio_advance() from public, anon, authenticated;
grant execute on function public.top_articles_human(int, int) to service_role;
grant execute on function public.growth_weekly_report() to service_role;
grant execute on function public.hit_studio_advance() to service_role;
revoke all on public.human_page_views from anon, authenticated;

-- ---------------------------------------------------------------- crons (UTC)
-- 04:00 and 13:00 UTC = 07:00 and 16:00 Israel (summer): morning news for the
-- 12:15 slot, afternoon news for 20:15. The daily quota stops a double pick.
select cron.schedule('agendax-hit-scout', '0 4,13 * * *', $cron$
  select net.http_post(
    url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/hit-scout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
$cron$);

select cron.schedule('agendax-hit-studio', '* * * * *', $cron$select public.hit_studio_advance()$cron$);
