-- "Hot" is recency-weighted, not all-time: views inside a sliding window
-- (default 48h), so the list reshuffles through the day as stories rise and
-- fade. Security definer over the RLS-locked page_views, same pattern as
-- get_article_view_counts — the homepage is public and page_views is not.
create or replace function public.get_hot_articles(p_hours integer default 48, p_limit integer default 10)
returns table (article_id uuid, views bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pv.article_id, count(*)::bigint as views
  from public.page_views pv
  join public.articles a on a.id = pv.article_id
  where pv.article_id is not null
    and a.is_draft = false
    and pv.viewed_at >= now() - make_interval(hours => greatest(coalesce(p_hours, 48), 1))
  group by pv.article_id
  order by views desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$function$;
