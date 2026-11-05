-- The writers system: the roster becomes editable end to end.
--
-- `authors` already exists (four declared AI agents, keyed by slug, with
-- articles.author_slug pointing at it). This migration grows it instead of
-- adding a parallel `writers` table:
--
--   * photo_alt, and length limits on role (60) and bio (400)
--   * a third kind, 'system', for the newsroom byline "מערכת AGENDAX"
--   * a slug made automatically from the Hebrew name, -1/-2 on a clash
--   * every article has an author: the six orphans go to the newsroom, and a
--     trigger catches any insert that arrives without one
--   * a writer with articles cannot be deleted by accident: the FK now
--     restricts, and reassign_and_delete_author() moves the articles first
--   * renaming a writer renames the byline on their articles

-- 1. Columns and limits ------------------------------------------------------

alter table public.authors add column if not exists photo_alt text;

alter table public.authors drop constraint if exists authors_kind_check;
alter table public.authors
  add constraint authors_kind_check check (kind in ('ai', 'human', 'system'));

alter table public.authors
  add constraint authors_role_length check (char_length(role) <= 60),
  add constraint authors_bio_length check (char_length(bio) <= 400),
  add constraint authors_name_present check (char_length(btrim(name)) > 0),
  -- ingest-worker signs each new story with the active writer whose
  -- category_slugs contain its category. Only an AI agent may hold a beat:
  -- a person's name must never land on a story a machine wrote.
  add constraint authors_beat_ai_only check (kind = 'ai' or category_slugs = '{}');

-- 2. Slug from the name -------------------------------------------------------

-- Keeps Hebrew and Latin letters and digits, turns runs of anything else into
-- one hyphen. The URL carries the Hebrew percent-encoded, like article slugs.
create or replace function public.author_slug_base(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      btrim(regexp_replace(lower(btrim(p_name)), '[^a-z0-9֐-׿]+', '-', 'g'), '-'),
      ''
    ),
    'writer'
  );
$$;

create or replace function public.author_unique_slug(p_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  base text := public.author_slug_base(p_name);
  candidate text := base;
  n int := 0;
begin
  while exists (select 1 from public.authors where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

create or replace function public.authors_set_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.author_unique_slug(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists authors_set_slug_trg on public.authors;
create trigger authors_set_slug_trg
  before insert on public.authors
  for each row execute function public.authors_set_slug();

-- 3. The newsroom byline ------------------------------------------------------

insert into public.authors (slug, name, kind, role, beat, bio, model_note, avatar_url, photo_alt, sort_order, is_active)
values (
  'agendax',
  'מערכת AGENDAX',
  'system',
  'מערכת האתר',
  null,
  'כתבות שנכתבו ונערכו על ידי מערכת AGENDAX, בלי שיוך לכתב או לסוכן מסוים.',
  '',
  null,
  null,
  1000,
  true
)
on conflict (slug) do nothing;

update public.articles
set author_slug = 'agendax', author = 'מערכת AGENDAX'
where author_slug is null;

-- Any writer of an insert that forgets the author (an old admin dialog, a
-- script, an ingest path) lands on the newsroom instead of failing.
create or replace function public.articles_default_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_slug is null then
    new.author_slug := 'agendax';
  end if;
  -- The byline text follows the writer row, so it never drifts.
  if tg_op = 'INSERT' or new.author_slug is distinct from old.author_slug then
    select name into new.author from public.authors where slug = new.author_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists articles_default_author_trg on public.articles;
create trigger articles_default_author_trg
  before insert or update of author_slug on public.articles
  for each row execute function public.articles_default_author();

alter table public.articles alter column author_slug set default 'agendax';
alter table public.articles alter column author_slug set not null;

-- 4. Safe delete --------------------------------------------------------------

alter table public.articles drop constraint if exists articles_author_slug_fkey;
alter table public.articles
  add constraint articles_author_slug_fkey
  foreign key (author_slug) references public.authors (slug)
  on update cascade on delete restrict;

-- Moves every article of one writer to another, then deletes the first.
-- Admin only. The newsroom byline itself cannot be deleted.
create or replace function public.reassign_and_delete_author(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  if not public.has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'admins only';
  end if;
  if p_from = 'agendax' then
    raise exception 'the newsroom byline cannot be deleted';
  end if;
  if p_from = p_to then
    raise exception 'choose a different writer';
  end if;
  if not exists (select 1 from public.authors where slug = p_to) then
    raise exception 'target writer not found';
  end if;

  update public.articles set author_slug = p_to where author_slug = p_from;
  get diagnostics moved = row_count;

  delete from public.authors where slug = p_from;
  return moved;
end;
$$;

revoke all on function public.reassign_and_delete_author(text, text) from public, anon;
grant execute on function public.reassign_and_delete_author(text, text) to authenticated;

-- 5. Rename follows through ---------------------------------------------------

create or replace function public.authors_sync_byline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.articles set author = new.name where author_slug = new.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists authors_sync_byline_trg on public.authors;
create trigger authors_sync_byline_trg
  after update of name on public.authors
  for each row execute function public.authors_sync_byline();

-- 6. Article counts for the admin list and the sitemap ------------------------

create or replace view public.author_article_counts
with (security_invoker = true)
as
select a.slug,
       count(x.id) filter (where x.is_draft = false) as published_count,
       count(x.id) as total_count
from public.authors a
left join public.articles x on x.author_slug = a.slug
group by a.slug;

grant select on public.author_article_counts to anon, authenticated;
