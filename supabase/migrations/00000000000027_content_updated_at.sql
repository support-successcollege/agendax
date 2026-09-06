-- dateModified must mean "the text changed", not "some column was written".
-- articles.updated_at is bumped by any UPDATE — pinning an article, flipping
-- the breaking flag, a backfill — so using it as lastmod/dateModified teaches
-- Google to ignore the signal. This column moves only when a reader would see
-- a difference.
alter table public.articles add column if not exists content_updated_at timestamptz;

update public.articles
   set content_updated_at = coalesce(published_at, created_at)
 where content_updated_at is null;

create or replace function public.touch_content_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.content_updated_at := coalesce(new.content_updated_at, new.published_at, now());
    return new;
  end if;

  -- Someone set the column on purpose (a backfill, an editor fixing a date):
  -- respect it rather than pinning it back to the old value.
  if new.content_updated_at is distinct from old.content_updated_at then
    return new;
  end if;

  -- Only the fields a reader actually reads count as a content change.
  if new.title is distinct from old.title
     or new.excerpt is distinct from old.excerpt
     or new.content is distinct from old.content
     or new.image_url is distinct from old.image_url
  then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_content_updated_at on public.articles;
create trigger trg_touch_content_updated_at
  before insert or update on public.articles
  for each row execute function public.touch_content_updated_at();

-- Articles that already carry an "עדכון · <date>" block from the rolling-story
-- flow get their real modification date recovered from that stamp.
with stamps as (
  select a.id,
         max(to_timestamp(m[1], 'DD.MM.YYYY, HH24:MI') at time zone 'Asia/Jerusalem') as latest
  from public.articles a,
       lateral regexp_matches(a.content, 'עדכון · ([0-9]{2}\.[0-9]{2}\.[0-9]{4}, [0-9]{2}:[0-9]{2})', 'g') m
  where a.content like '%article-update%'
  group by a.id
)
update public.articles a
   set content_updated_at = s.latest
  from stamps s
 where a.id = s.id and s.latest > coalesce(a.content_updated_at, a.published_at);
