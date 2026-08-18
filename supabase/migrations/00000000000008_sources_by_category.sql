-- Sources are organized by the site's own categories, not by a parallel
-- taxonomy. The seeded feed list is wiped — sources are editorial curation,
-- entered by the editor in the admin tab — and news_sources.bucket now holds a
-- category slug, enforced by a foreign key so it can never drift from the
-- categories table (the way three hardcoded category maps already did).

-- The editor starts from a clean list and adds real sources per category.
delete from public.news_sources;

alter table public.news_sources
  drop constraint if exists news_sources_bucket_chk;

alter table public.news_sources
  drop constraint if exists news_sources_bucket_fkey;

-- ON UPDATE CASCADE: renaming a category's slug carries its sources along.
-- ON DELETE RESTRICT: a category with sources attached cannot be deleted out
-- from under them.
alter table public.news_sources
  add constraint news_sources_bucket_fkey
  foreign key (bucket) references public.categories (slug)
  on update cascade on delete restrict;
