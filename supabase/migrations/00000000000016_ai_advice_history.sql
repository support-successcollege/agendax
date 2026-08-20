-- Site-analysis advice used to evaporate on page reload. Every run is now a
-- row, so advice accumulates into a history the admin can scroll back through.
create table if not exists public.ai_advice (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_advice enable row level security;

drop policy if exists "Admins manage ai advice" on public.ai_advice;
create policy "Admins manage ai advice" on public.ai_advice
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
