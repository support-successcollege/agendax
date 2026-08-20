-- Swapping the featured article used to be two client-side updates; a failure
-- between them left the site with no featured article at all. One statement,
-- atomic by nature: the chosen article becomes featured, everything else
-- stops being featured, in the same write.
create or replace function public.set_featured_article(_article_id uuid)
returns void
language sql
set search_path to 'public'
as $function$
  update public.articles
     set is_featured = (id = _article_id)
   where is_featured or id = _article_id;
$function$;
