-- The newsletter becomes a real channel: every send is recorded, and
-- unsubscribing is a one-click link in the email itself.
create table if not exists public.newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  category text,
  article_ids uuid[] not null default '{}',
  recipients_count integer not null default 0,
  test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.newsletter_sends enable row level security;

drop policy if exists "Admins manage newsletter sends" on public.newsletter_sends;
create policy "Admins manage newsletter sends" on public.newsletter_sends
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- One-click unsubscribe from the email link. Security definer: the visitor is
-- anonymous; the subscriber row id (an unguessable uuid, carried only in that
-- subscriber's own email) is the credential.
create or replace function public.unsubscribe_newsletter(_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  update public.newsletter_subscribers
     set is_active = false
   where id = _id and is_active
  returning true;
$function$;
