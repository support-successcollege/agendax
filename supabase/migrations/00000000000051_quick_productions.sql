-- Quick production ("הפקה מהירה"): a hot story goes from a typed headline to a
-- reviewed draft to the site and the social networks in a few minutes, from
-- the /quick page.
--
-- Two things live here:
--   1. quick_productions - the audit trail. What was asked for, which sources
--      were found and read, what the reviewer flagged, the exact teaser texts
--      the editor approved, who approved, and what each network answered.
--   2. quick_publish()   - the one transaction that puts an approved draft on
--      air: the draft flips live, the approved teasers become the pending
--      social_posts rows the publisher already honours, and one manual
--      social_queue row is added so the auto-fill sweep treats the article as
--      handled and cannot queue it a second time.
--
-- Only the quick-article edge function (service role) writes here, and it runs
-- its publish action for a logged-in admin only. A scheduled job cannot
-- publish through it.

create table if not exists public.quick_productions (
  id uuid primary key default gen_random_uuid(),
  -- 'manual' = the editor typed a headline; 'auto' = a detector prepared it.
  origin text not null default 'manual' check (origin in ('manual', 'auto')),
  status text not null default 'drafting'
    check (status in ('drafting', 'ready', 'publishing', 'published', 'unpublished', 'failed', 'expired')),
  requested_title text not null,
  pasted_urls text[] not null default '{}',
  article_id uuid references public.articles (id) on delete set null,
  -- [{outlet, domain, title, url, publishedAt, origin, read, note}]
  sources jsonb not null default '[]'::jsonb,
  outlets_count integer not null default 0,
  -- One outlet only, or every outlet quoting the same original report.
  single_source boolean not null default false,
  single_source_note text,
  -- The text of the sources that were read; the reviewer compares the draft
  -- against it. Never shown to readers.
  research text,
  -- The writer's cover-image brief; the image itself is made in a later call.
  image_prompt text,
  -- Reviewer output: sentences with no backing in the sources, and wording
  -- lifted from a source.
  unsupported jsonb not null default '[]'::jsonb,
  -- Fingerprint of the exact title, excerpt and body the reviewer scored.
  -- Publish refuses a text that is not the one reviewed.
  reviewed_hash text,
  -- Quoted: OVERLAPS is a reserved word in Postgres. Raw SQL must quote it too.
  "overlaps" jsonb not null default '[]'::jsonb,
  -- Proposed teasers per network, as last generated: {facebook, instagram, linkedin, whatsapp}.
  teasers jsonb not null default '{}'::jsonb,
  -- The exact texts the editor approved, for the networks that were chosen.
  approved_teasers jsonb not null default '{}'::jsonb,
  platforms text[] not null default '{}',
  queue_ids uuid[] not null default '{}',
  -- Per-network outcome, written once the queue row is finished.
  results jsonb,
  error text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quick_productions_created
  on public.quick_productions (created_at desc);
create index if not exists idx_quick_productions_article
  on public.quick_productions (article_id);

create trigger update_quick_productions_updated_at
  before update on public.quick_productions
  for each row execute function public.update_articles_updated_at();

alter table public.quick_productions enable row level security;

-- Admins may read the trail from the panel. There is no insert/update/delete
-- policy on purpose: every write goes through the edge function's service role.
create policy "Admins read quick productions" on public.quick_productions
  as permissive for select to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- quick_publish: draft -> live, teasers -> pending, one manual queue row.
-- ---------------------------------------------------------------------------
--
-- The caller (the edge function) has already taken the production from
-- 'ready' to 'publishing' with a conditional update, which is what stops a
-- double click. It has also saved the editor's final text to the draft and
-- re-run the quality checklist on it. This function only flips the switch,
-- and refuses if the draft row changed since the editor last saw it
-- (the ingest updater may append an "עדכון" block to a draft).
--
-- _teasers holds only the networks that should go out, for example
--   {"facebook": "...", "instagram": "..."}
-- An empty object publishes to the site alone: no pending rows, no queue row.
create or replace function public.quick_publish(
  _production_id uuid,
  _expected_updated_at timestamptz,
  _is_breaking boolean,
  _teasers jsonb,
  _approved_by uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prod public.quick_productions%rowtype;
  v_slug text;
  v_published_at timestamptz := now();
  v_platforms text[];
  v_queue_id uuid;
  v_platform text;
begin
  select * into v_prod
    from public.quick_productions
   where id = _production_id
     for update;
  if not found then
    raise exception 'quick_publish: production % not found', _production_id;
  end if;
  if v_prod.status <> 'publishing' then
    raise exception 'quick_publish: production is %, expected publishing', v_prod.status;
  end if;
  if v_prod.article_id is null then
    raise exception 'quick_publish: production has no article';
  end if;

  update public.articles
     set is_draft = false,
         published_at = v_published_at,
         scheduled_at = null,
         -- The draft may have been written on an earlier day; the date a
         -- reader sees is the day it went live, in Israel time.
         date = (v_published_at at time zone 'Asia/Jerusalem')::date,
         is_breaking = coalesce(_is_breaking, false)
   where id = v_prod.article_id
     and is_draft = true
     and updated_at = _expected_updated_at
  returning slug into v_slug;
  if not found then
    raise exception 'quick_publish: the draft changed since it was reviewed, or is already live';
  end if;

  select coalesce(array_agg(k order by k), '{}')
    into v_platforms
    from jsonb_object_keys(coalesce(_teasers, '{}'::jsonb)) as k
   where k in ('facebook', 'instagram', 'linkedin')
     and length(trim(coalesce(_teasers ->> k, ''))) > 0
     -- A network that already carries this article is never posted to again,
     -- whatever route the article took back to draft.
     and not exists (
           select 1 from public.social_posts p
            where p.article_id = v_prod.article_id
              and p.platform = k
              and p.status = 'posted');

  foreach v_platform in array v_platforms loop
    insert into public.social_posts (article_id, platform, status, post_text, external_id, error)
    values (v_prod.article_id, v_platform, 'pending', _teasers ->> v_platform, null, null)
    on conflict (article_id, platform) do update
      set status = 'pending',
          post_text = excluded.post_text,
          external_id = null,
          error = null
      where public.social_posts.status <> 'posted';
  end loop;

  if array_length(v_platforms, 1) > 0 then
    insert into public.social_queue (article_id, platforms, kind, scheduled_at, status, source)
    values (v_prod.article_id, v_platforms, 'post', now(), 'queued', 'manual')
    returning id into v_queue_id;
  end if;

  -- "published" is set here, in the same transaction that put the article on
  -- air, so the two can never disagree.
  update public.quick_productions
     set status = 'published',
         approved_teasers = coalesce(_teasers, '{}'::jsonb),
         platforms = v_platforms,
         queue_ids = case when v_queue_id is null then queue_ids else array_append(queue_ids, v_queue_id) end,
         approved_by = _approved_by,
         approved_at = v_published_at,
         error = null
   where id = _production_id;

  return jsonb_build_object(
    'article_id', v_prod.article_id,
    'slug', v_slug,
    'published_at', v_published_at,
    'queue_id', v_queue_id,
    'platforms', to_jsonb(v_platforms)
  );
end;
$function$;

revoke all on function public.quick_publish(uuid, timestamptz, boolean, jsonb, uuid) from public;
revoke all on function public.quick_publish(uuid, timestamptz, boolean, jsonb, uuid) from anon, authenticated;
grant execute on function public.quick_publish(uuid, timestamptz, boolean, jsonb, uuid) to service_role;
