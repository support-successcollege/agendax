-- Carousel posts for Instagram and Facebook.
--
-- A carousel is built in stages that cannot share one request: the script is
-- written, a background image is generated per slide (asynchronously, on
-- Higgsfield), and each slide is rendered with its Hebrew text on top — one
-- render per worker, because satori at 1080×1350 exhausts a worker that tries
-- two. So the carousel is a row that moves through those stages, and the
-- panel and the publisher both read where it has got to.

create table if not exists public.social_carousels (
  id          uuid        primary key default gen_random_uuid(),
  article_id  uuid        not null references public.articles(id) on delete cascade,
  -- generating: images or renders still outstanding
  -- ready:      every slide has its final PNG
  -- failed:     the script could not be written at all
  status      text        not null default 'generating'
              check (status in ('generating', 'ready', 'failed')),
  caption     text        not null default '',
  -- [{ kind: cover|point|cta, title, body, prompt,
  --    hf_request_id, bg_url, bg_source: higgsfield|article, bg_error,
  --    png_url, version }]
  slides      jsonb       not null default '[]'::jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists social_carousels_article_idx
  on public.social_carousels (article_id, created_at desc);

alter table public.social_carousels enable row level security;

drop policy if exists "Admins manage carousels" on public.social_carousels;
create policy "Admins manage carousels" on public.social_carousels
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- ------------------------------------------------------------- the queue
-- A queued carousel publishes a specific carousel, not "the article as a
-- carousel": the editor may have built several and chosen one.
alter table public.social_queue
  add column if not exists carousel_id uuid references public.social_carousels(id) on delete cascade;

alter table public.social_queue drop constraint if exists social_queue_kind_check;
alter table public.social_queue
  add constraint social_queue_kind_check
  check (kind in ('post', 'story', 'carousel'));

alter table public.social_queue drop constraint if exists social_queue_carousel_ref_check;
alter table public.social_queue
  add constraint social_queue_carousel_ref_check
  check (kind <> 'carousel' or carousel_id is not null);
