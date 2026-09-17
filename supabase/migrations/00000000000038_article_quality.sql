-- A measured quality score per article, and somewhere to keep what failed.
--
-- `review_score` already existed, but it is one model's opinion, taken once, at
-- writing time, and never revisited. It cannot answer "which articles are short
-- a subheading" or "how much of the archive carries an internal link", and
-- nothing recomputes it when an article is edited.
--
-- These columns hold the result of a checklist instead: every criterion is a
-- yes/no a person could verify by hand, so a score of 100 means something
-- specific rather than "the model was in a good mood".

alter table public.articles
  add column if not exists quality_score integer,
  -- [{ id, label, ok, detail }] — the whole checklist, so the panel can show
  -- exactly what is missing rather than just a number.
  add column if not exists quality_issues jsonb not null default '[]'::jsonb,
  add column if not exists quality_checked_at timestamptz;

-- The panel's first question is always "what is not at 100 yet".
create index if not exists articles_quality_idx
  on public.articles (quality_score, published_at desc);

-- An edit invalidates the score: a rewritten article has not been checked.
-- Only the columns a reader sees count, and the audit's own writes are ignored
-- so that storing a result does not immediately mark it stale.
create or replace function public.clear_quality_on_edit()
returns trigger
language plpgsql
as $$
begin
  if new.quality_checked_at is distinct from old.quality_checked_at then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.excerpt is distinct from old.excerpt
     or new.content is distinct from old.content
     or new.image_url is distinct from old.image_url
     or new.slug is distinct from old.slug then
    new.quality_score := null;
    new.quality_checked_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists articles_clear_quality on public.articles;
create trigger articles_clear_quality
  before update on public.articles
  for each row execute function public.clear_quality_on_edit();
