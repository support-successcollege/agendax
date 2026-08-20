-- Unique-visitor tracking. The browser can see neither IP nor MAC; the
-- standard identity is a random id minted once per browser and kept in
-- localStorage — more accurate than IP anyway (one office NAT = one IP,
-- many visitors). The tracker sends it with every page view.
alter table public.page_views add column if not exists visitor_id text;

create index if not exists idx_page_views_visitor
  on public.page_views (visitor_id, viewed_at desc)
  where visitor_id is not null;

-- Unique visitors per window, Israel-local day boundary like the rest of the
-- pipeline. Security definer over the RLS-locked page_views, admin dashboards
-- read it like the other stats RPCs.
create or replace function public.get_visitor_stats()
returns table (
  unique_today integer,
  unique_week integer,
  unique_month integer,
  unique_total integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (select count(distinct visitor_id)::integer from public.page_views
      where visitor_id is not null
        and viewed_at >= (date_trunc('day', timezone('Asia/Jerusalem', now())) at time zone 'Asia/Jerusalem')),
    (select count(distinct visitor_id)::integer from public.page_views
      where visitor_id is not null and viewed_at >= now() - interval '7 days'),
    (select count(distinct visitor_id)::integer from public.page_views
      where visitor_id is not null and viewed_at >= now() - interval '30 days'),
    (select count(distinct visitor_id)::integer from public.page_views
      where visitor_id is not null);
$function$;
