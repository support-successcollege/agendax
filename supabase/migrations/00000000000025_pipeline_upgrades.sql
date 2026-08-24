-- Six pipeline upgrades in one pass:
--   1. A second AI pass reviews every draft against its sources; the score
--      and note land on the article, and a low score keeps it unscheduled.
--   2. A picked story can be an UPDATE of an article already on the site
--      (ingest_items.update_of) instead of a fresh piece.
--   3. Headline feedback: the writer sees which recent headlines drew readers
--      and which did not (headline_performance).
--   4. The daily quota gets a weekend value (Fri/Sat, Israel).
--   5. Sources that stay broken for 14 days switch themselves off.
--   6. (Prompt-side only — the "למה זה חשוב לך" closing section.)

-- 1. Review verdict, for the editors' eyes.
alter table public.articles add column if not exists review_score int;
alter table public.articles add column if not exists review_note text;

-- 2. Story updates.
alter table public.ingest_items add column if not exists update_of uuid
  references public.articles (id) on delete set null;

-- 4. Weekend quota. Weekdays go up to 3 per category, Fri/Sat drop to 1.
alter table public.ingest_config add column if not exists weekend_target int not null default 1;
update public.ingest_config set daily_target = 3 where daily_target = 2;

drop function if exists public.ingest_daily_stats();
create function public.ingest_daily_stats()
returns table (
  published_today integer,
  queued integer,
  daily_target integer,
  weekend_target integer,
  lookback_hours integer,
  queue_buffer integer,
  category_count integer
)
language sql
stable
set search_path to 'public'
as $function$
  select
    (select count(*)::integer
       from public.ingest_items
      where status = 'published'
        and published_at >= (date_trunc('day', timezone('Asia/Jerusalem', now())) at time zone 'Asia/Jerusalem')),
    (select count(*)::integer
       from public.ingest_items
      where status in ('pending', 'processing')),
    c.daily_target,
    c.weekend_target,
    c.lookback_hours,
    c.queue_buffer,
    (select count(*)::integer from public.categories
      where is_active and slug <> 'home')
  from public.ingest_config c
  limit 1;
$function$;

-- 3. What worked and what did not, headline-wise: the most and least read
-- articles of the last week (old enough to have had a fair chance).
drop function if exists public.headline_performance();
create function public.headline_performance()
returns table (title text, views integer, side text)
language sql
stable
set search_path to 'public'
as $function$
  with scored as (
    select a.title, count(pv.id)::integer as views
    from public.articles a
    left join public.page_views pv
      on pv.article_id = a.id and pv.viewed_at > now() - interval '7 days'
    where not a.is_draft
      and a.category_slug <> 'marketing'
      and a.published_at between now() - interval '7 days' and now() - interval '20 hours'
    group by a.id, a.title
  )
  (select title, views, 'top' from scored order by views desc limit 5)
  union all
  (select title, views, 'bottom' from scored order by views asc limit 5);
$function$;

-- 5. Dead-feed bookkeeping.
alter table public.news_sources add column if not exists first_failed_at timestamptz;
alter table public.news_sources add column if not exists auto_disabled_at timestamptz;
