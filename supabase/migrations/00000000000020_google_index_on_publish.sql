-- Ping Google's Indexing API whenever an article goes live — regardless of
-- which door it left through (publish cron, the panel's publish button, or a
-- direct insert of a live article).
create or replace function public.notify_google_index()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ingest_cron_secret';
  if secret is not null then
    perform net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/index-article',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-secret', secret),
      body := jsonb_build_object('articleId', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_index_on_publish_update on public.articles;
create trigger trg_index_on_publish_update
after update of is_draft on public.articles
for each row
when (old.is_draft = true and new.is_draft = false)
execute function public.notify_google_index();

drop trigger if exists trg_index_on_publish_insert on public.articles;
create trigger trg_index_on_publish_insert
after insert on public.articles
for each row
when (new.is_draft = false)
execute function public.notify_google_index();
