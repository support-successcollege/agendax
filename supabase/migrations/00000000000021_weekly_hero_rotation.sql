-- The hero's weekly rotation pool: 10 leading articles, refreshed every week,
-- at least 2 from each active category (the rest fill up by views).
create table if not exists public.hero_rotation (
  article_id uuid primary key references public.articles(id) on delete cascade,
  rank integer not null,
  picked_at timestamptz not null default now()
);
alter table public.hero_rotation enable row level security;
drop policy if exists "hero rotation is public" on public.hero_rotation;
create policy "hero rotation is public" on public.hero_rotation for select using (true);

create or replace function public.refresh_hero_rotation()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  create temp table _picks on commit drop as
  with stats as (
    select a.id, a.category_slug, coalesce(v.views, 0) as views, a.published_at
    from public.articles a
    left join (
      select article_id, count(*) as views
      from public.page_views
      where viewed_at >= now() - interval '7 days' and article_id is not null
      group by article_id
    ) v on v.article_id = a.id
    where a.is_draft = false
      and a.category_slug in (select slug from public.categories where is_active and slug <> 'home')
  ),
  per_category as (
    select id, views, published_at,
           row_number() over (partition by category_slug order by views desc, published_at desc nulls last) as rn
    from stats
  ),
  base as (
    select id, views, published_at from per_category where rn <= 2
  ),
  filler as (
    select id, views, published_at
    from stats
    where id not in (select id from base)
    order by views desc, published_at desc nulls last
    limit greatest(0, 10 - (select count(*) from base))
  )
  select id, views, published_at from base
  union all
  select id, views, published_at from filler;

  delete from public.hero_rotation;
  insert into public.hero_rotation (article_id, rank)
  select id, row_number() over (order by views desc, published_at desc nulls last)
  from _picks
  limit 10;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Refresh every Sunday at 03:00 Israel time (01:00 UTC).
select cron.schedule('agendax-hero-rotation', '0 1 * * 0', $$select public.refresh_hero_rotation()$$);
