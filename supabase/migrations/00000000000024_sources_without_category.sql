-- Sources stop carrying a category. The editor asked for a single flat feed
-- pool: the ranker reads everything and files each picked story under the
-- right site category by itself (ingest_items.bucket now records the ranker's
-- choice, which keeps the per-category quota machinery working unchanged).
alter table public.news_sources drop constraint if exists news_sources_bucket_fkey;
alter table public.news_sources drop constraint if exists news_sources_bucket_chk;
alter table public.news_sources alter column bucket drop not null;
alter table public.news_sources alter column bucket drop default;
update public.news_sources set bucket = null;
