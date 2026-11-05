-- Retire the AI writer personas.
--
-- The site moves to a staff of real writers. Until they join, every story is
-- signed by the newsroom, "חדשות AgendaX". The four AI agents (eden, itay,
-- shira, roi) and their profiles go away; their stories move to the newsroom.
--
-- No beats remain: ingest-worker finds no writer for a category and signs the
-- newsroom. The constraint below keeps it that way, so a person's name is only
-- ever put on a story by hand, never by the pipeline.

-- 1. The newsroom byline gets its public name. The rename trigger
--    (authors_sync_byline_trg) updates the byline text on its stories.
update public.authors
set name = 'חדשות AgendaX',
    role = 'דסק החדשות',
    bio = 'דסק החדשות של AgendaX: הייטק, בינה מלאכותית, שוק ההון ופיתוח עסקי.',
    model_note = '',
    updated_at = now()
where slug = 'agendax';

-- 2. Every story of an AI writer moves to the newsroom. The articles trigger
--    (articles_default_author_trg) sets the byline text from the writer row.
--    Changing the author does not bump content_updated_at or ping Google.
update public.articles
set author_slug = 'agendax'
where author_slug in (select slug from public.authors where kind = 'ai');

-- 3. The AI writers themselves.
delete from public.authors where kind = 'ai';

-- 4. Two kinds remain: real writers and the newsroom.
alter table public.authors drop constraint if exists authors_kind_check;
alter table public.authors
  add constraint authors_kind_check check (kind in ('human', 'system'));

-- No writer holds a beat: the pipeline never signs a story with a person.
alter table public.authors drop constraint if exists authors_beat_ai_only;
alter table public.authors
  add constraint authors_no_beat check (category_slugs = '{}');

-- 5. The fallback name for any insert without a writer.
update public.articles
set author = 'חדשות AgendaX'
where author_slug = 'agendax' and author is distinct from 'חדשות AgendaX';
