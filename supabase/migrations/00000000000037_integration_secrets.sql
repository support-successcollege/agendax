-- Keys the admin panel can set, so switching a provider on no longer means
-- opening the Supabase dashboard.
--
-- Captured from the live database, which already had it: without this file a
-- fresh environment gets the panel card with nothing behind it.
--
-- The security shape, and its limit. The table has row-level security on and no
-- policies at all, so only the service role reads it — not the site, not an
-- anonymous caller, not even the admin who typed the key. Values are stored as
-- written, though, so they do reach the database's backups. Supabase's own
-- secret store keeps values out of the database entirely and therefore stays
-- the stronger place; `getSecret` in the functions reads it first for exactly
-- that reason, and the card says so.

create table if not exists public.integration_secrets (
  key         text        primary key,
  value       text        not null default '',
  -- What the panel is allowed to show: bullets and the last four characters.
  preview     text        not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.integration_secrets enable row level security;
-- Deliberately no policies. Reads go through the service role in the Edge
-- Functions; writes go through set_integration_secret below.

/** The allow-list. The table must not become a general-purpose key store. */
create or replace function public.integration_secret_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'PEXELS_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'AI_PRIMARY'
  ];
$$;

/** What the panel may know: whether a key is set, and its last four characters. */
create or replace function public.integration_secrets_status()
returns table(key text, is_set boolean, preview text, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  return query
  select k.key,
         s.key is not null as is_set,
         coalesce(s.preview, '') as preview,
         s.updated_at
  from unnest(public.integration_secret_keys()) as k(key)
  left join public.integration_secrets s on s.key = k.key
  order by k.key;
end;
$$;

/** Writes one key, or removes it when the value is blank. Admins only. */
create or replace function public.set_integration_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clean text := btrim(coalesce(p_value, ''));
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  if not (p_key = any (public.integration_secret_keys())) then
    raise exception 'unknown key %', p_key;
  end if;

  -- Clearing a key falls back to whatever Supabase's secret store holds.
  if v_clean = '' then
    delete from public.integration_secrets where key = p_key;
    return;
  end if;

  insert into public.integration_secrets (key, value, preview, updated_at, updated_by)
  values (
    p_key,
    v_clean,
    case when length(v_clean) > 4 then repeat('•', 4) || right(v_clean, 4) else repeat('•', length(v_clean)) end,
    now(),
    auth.uid()
  )
  on conflict (key) do update
    set value = excluded.value,
        preview = excluded.preview,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_integration_secret(text, text) from public, anon;
