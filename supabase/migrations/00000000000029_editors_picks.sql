-- "בחירת העורכים" — the rail's front section, chosen once a day.
--
-- What it replaces: a most-read list ranked by 48h page views. At this site's
-- traffic (tens of views a day) that ranking is mostly noise, and the same
-- three articles sat at the top for days — the opposite of a page someone
-- tends. This table holds one deliberate set per day, with a line of reasoning
-- per article, so the section reads as edited rather than computed.
create table if not exists public.editors_picks (
  id uuid primary key default gen_random_uuid(),
  -- Israel local date: the day the reader sees, not a UTC boundary.
  pick_date date not null default (timezone('Asia/Jerusalem', now()))::date,
  article_id uuid not null references public.articles (id) on delete cascade,
  rank int not null check (rank between 1 and 12),
  -- One line in an editor's voice on why this one is here. Null is allowed:
  -- the deterministic fallback picks articles but writes no notes.
  note text,
  created_at timestamptz not null default now(),
  unique (pick_date, article_id),
  unique (pick_date, rank)
);

create index if not exists idx_editors_picks_date
  on public.editors_picks (pick_date desc, rank);

alter table public.editors_picks enable row level security;

-- The site reads this anonymously, like hero_rotation and funding_deals.
drop policy if exists "Public reads editors picks" on public.editors_picks;
create policy "Public reads editors picks" on public.editors_picks
  as permissive for select to public using (true);

drop policy if exists "Admins manage editors picks" on public.editors_picks;
create policy "Admins manage editors picks" on public.editors_picks
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
