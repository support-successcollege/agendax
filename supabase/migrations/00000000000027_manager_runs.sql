-- The site manager agent (skills/agendax-manager) writes one row per run:
-- what it saw, what it changed by itself, and what it wants approved.
-- Why a table and not a chat message: a scheduled run has no human in the
-- loop, so its red-zone proposals have to survive until someone reads them.
create table if not exists public.manager_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'daily' check (kind in ('daily', 'overview', 'domain', 'adhoc')),
  ran_at timestamptz not null default now(),
  -- Counters from Q1 plus whatever the run measured.
  summary jsonb not null default '{}'::jsonb,
  -- The report exactly as it was shown to the user.
  report_md text,
  -- Red-zone actions awaiting approval: [{n, title, why, sql}]
  proposals jsonb not null default '[]'::jsonb,
  -- What the agent did on its own: [{action, target, detail}]
  actions_taken jsonb not null default '[]'::jsonb,
  status text not null default 'reported'
    check (status in ('reported', 'approved', 'partially_approved', 'dismissed')),
  approved_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_manager_runs_ran_at on public.manager_runs (ran_at desc);

alter table public.manager_runs enable row level security;

drop policy if exists "Admins manage manager runs" on public.manager_runs;
create policy "Admins manage manager runs" on public.manager_runs
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
