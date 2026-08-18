-- The daily target becomes per-category: "10 articles a day" now means ten in
-- each active site category, not ten across the whole site. The scanner tops
-- up each category's queue separately and the worker only claims stories from
-- categories that still have budget today, so one busy category can never
-- starve the others.

-- daily_target keeps its column; only its meaning changes (per category).
comment on column public.ingest_config.daily_target is
  'Drafts the agent should produce per calendar day (Israel time) IN EACH active category.';

-- ---------------------------------------------------------------------------
-- Per-category standing: one row per active category, with today''s counts
-- ---------------------------------------------------------------------------
-- Categories drive the rows (not the items) so a category with zero activity
-- still appears with 0/target instead of vanishing from the panel.
drop function if exists public.ingest_category_stats();
create function public.ingest_category_stats()
returns table (
  bucket text,
  name text,
  published_today integer,
  queued integer
)
language sql
stable
set search_path to 'public'
as $function$
  select
    c.slug,
    c.name,
    coalesce((
      select count(*)::integer from public.ingest_items i
       where i.bucket = c.slug and i.status = 'published'
         and i.published_at >= (date_trunc('day', timezone('Asia/Jerusalem', now())) at time zone 'Asia/Jerusalem')
    ), 0),
    coalesce((
      select count(*)::integer from public.ingest_items i
       where i.bucket = c.slug and i.status in ('pending', 'processing')
    ), 0)
  from public.categories c
  where c.is_active and c.slug <> 'home'
  order by c.display_order;
$function$;

-- ---------------------------------------------------------------------------
-- Totals gain the category count, so "today: X/Y" can show the real day total
-- ---------------------------------------------------------------------------
-- Return type changes, so the old function must be dropped first.
drop function if exists public.ingest_daily_stats();
create function public.ingest_daily_stats()
returns table (
  published_today integer,
  queued integer,
  daily_target integer,
  queue_buffer integer,
  lookback_hours integer,
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
    c.queue_buffer,
    c.lookback_hours,
    (select count(*)::integer from public.categories
      where is_active and slug <> 'home')
  from public.ingest_config c
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- The claim honors category budgets
-- ---------------------------------------------------------------------------
-- The worker passes the categories that still have budget today; null keeps
-- the old take-anything behaviour. Items with no bucket (legacy rows) are
-- claimable as long as any category still has budget, since their category is
-- resolved only at write time.
drop function if exists public.claim_ingest_item();
create function public.claim_ingest_item(_buckets text[] default null)
returns public.ingest_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claimed public.ingest_items;
begin
  select * into claimed
  from public.ingest_items
  where status = 'pending' and attempts < 3
    and (_buckets is null or bucket is null or bucket = any(_buckets))
  order by priority desc, source_published_at desc nulls last, created_at asc
  limit 1
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update public.ingest_items
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$function$;

revoke all on function public.claim_ingest_item(text[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
