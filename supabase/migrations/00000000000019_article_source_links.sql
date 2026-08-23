-- Editorial source list per article: visible to admins in the edit dialog,
-- never rendered into the public article body.
alter table public.articles add column if not exists source_links jsonb;
comment on column public.articles.source_links is 'Attribution links [{title,url}] shown to editors only';
