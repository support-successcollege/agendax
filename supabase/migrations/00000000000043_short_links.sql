-- agendax.co.il/a/<code> — the address a private message can carry.
--
-- Every article's slug is its Hebrew headline, and Meta stops recognising a
-- link at the first non-Latin character, so a message carrying one arrives as
-- plain text nobody can tap. The short code is the first eight characters of
-- the article's id: ASCII, short, and nothing new to store.
--
-- A function rather than a query from the edge function, because `id` is a
-- uuid and Postgres has no ilike for it — PostgREST answered with an error
-- that the redirect quietly swallowed, sending every reader to the home page.

create or replace function public.article_by_short_code(p_code text)
returns table (id uuid, slug text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, a.slug
  from public.articles a
  where a.is_draft = false
    and a.id::text like lower(btrim(p_code)) || '%'
  -- Two matches means the code cannot answer the question; the caller sends
  -- the reader home rather than to the wrong article.
  limit 2;
$$;

revoke all on function public.article_by_short_code(text) from public, anon;
grant execute on function public.article_by_short_code(text) to service_role;
