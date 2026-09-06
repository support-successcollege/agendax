-- Splitting the scan across workers.
--
-- One worker reading ~950 feeds dies with WORKER_RESOURCE_LIMIT: fetching and
-- regex-parsing that many documents costs more CPU than a single Edge Function
-- invocation is allowed, whatever the memory footprint. Bounding concurrency
-- and capping feed bodies helped, but the total work is simply too big for one
-- request.
--
-- So the scan splits in two. Several shard workers each read a slice of the
-- sources and drop what they found into a buffer; a few minutes later the
-- ranker reads the buffer once and does the deduping, ranking and queueing it
-- always did. The expensive half now scales by adding shards.

create table if not exists public.ingest_scan_buffer (
  url_key             text primary key,
  url                 text        not null,
  title               text        not null,
  summary             text        not null default '',
  image_url           text,
  source_name         text        not null,
  weight              integer     not null default 5,
  item_published_at   timestamptz,
  scanned_at          timestamptz not null default now()
);

-- The ranker reads one window; the sweeper deletes everything older.
create index if not exists ingest_scan_buffer_scanned_idx
  on public.ingest_scan_buffer (scanned_at desc);

alter table public.ingest_scan_buffer enable row level security;
-- No policies: only the service role (the functions) ever touches this. It is
-- a work queue between two functions, not something the site or the panel reads.

-- Two shards racing on the same story is the normal case, not an error: the
-- same wire item reaches a dozen feeds. First writer wins, unless the second
-- came from a more trusted outlet.
create or replace function public.buffer_scan_items(_items jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  inserted integer;
begin
  with input as (
    select
      i->>'url_key'                              as url_key,
      i->>'url'                                  as url,
      i->>'title'                                as title,
      coalesce(i->>'summary', '')                as summary,
      nullif(i->>'image_url', '')                as image_url,
      i->>'source_name'                          as source_name,
      coalesce((i->>'weight')::int, 5)           as weight,
      nullif(i->>'item_published_at', '')::timestamptz as item_published_at
    from jsonb_array_elements(_items) i
  ),
  deduped as (
    -- One shard can carry the same URL twice; `on conflict` cannot see a
    -- duplicate inside its own statement, so collapse it here first.
    select distinct on (url_key) *
      from input
     where url_key is not null and url is not null and title is not null
     order by url_key, weight desc
  )
  insert into public.ingest_scan_buffer as b
        (url_key, url, title, summary, image_url, source_name, weight, item_published_at)
  select url_key, url, title, summary, image_url, source_name, weight, item_published_at
    from deduped
  on conflict (url_key) do update
     set weight      = excluded.weight,
         source_name = excluded.source_name,
         scanned_at  = now()
   where excluded.weight > b.weight;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.buffer_scan_items(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- scheduling
-- Old plan: one invocation reads every feed. New plan: six shard workers at
-- :02, the ranker at :08 — six minutes is far more than the shards need and
-- costs nothing, since the buffer only grows while they run.
do $$ begin perform cron.unschedule('agendax-ingest-scan'); exception when others then null; end $$;

do $$
declare
  shard_count constant int := 6;
  i int;
begin
  for i in 0 .. shard_count - 1 loop
    begin perform cron.unschedule('agendax-scan-shard-' || i); exception when others then null; end;
    perform cron.schedule(
      'agendax-scan-shard-' || i,
      '2 * * * *',
      format($fmt$
        select net.http_post(
          url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-scan-shard',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
          ),
          body := '{"shard": %s, "shards": %s}'::jsonb,
          timeout_milliseconds := 150000
        );
      $fmt$, i, shard_count)
    );
  end loop;
end $$;

select cron.schedule(
  'agendax-ingest-rank',
  '8 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-global-tech',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$
);
