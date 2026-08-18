-- Global hi-tech ingest pipeline.
--
-- Two Edge Functions share this schema:
--   ingest-global-tech  — scans RSS feeds, ranks candidates, enqueues the winners
--   ingest-worker       — takes one queued item, rewrites it in Hebrew, saves a draft
--
-- The split exists because an Edge Function has a wall-clock limit and rewriting
-- an article (fetch + two model calls + image generation) is far too slow to do
-- four times inside a single invocation. The queue also makes every step
-- retryable and auditable.

-- ---------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------
create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_url text not null unique,
  homepage text,
  -- general | ai | business | dev — used to keep one bucket from flooding a run
  bucket text not null default 'general',
  -- 1..10, a hint to the ranker about how much this outlet is trusted
  weight integer not null default 5,
  is_active boolean not null default true,
  last_fetched_at timestamptz,
  last_status text,
  last_item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_sources_bucket_chk check (bucket in ('general', 'ai', 'business', 'dev')),
  constraint news_sources_weight_chk check (weight between 1 and 10)
);

create index if not exists idx_news_sources_active on public.news_sources (is_active, bucket);

-- ---------------------------------------------------------------------------
-- Ingest ledger / work queue
-- ---------------------------------------------------------------------------
-- Every URL the scanner has ever seen gets exactly one row here. That is what
-- makes the pipeline idempotent: a story is never re-ranked and never
-- re-written, no matter how many feeds carry it or how often cron runs.
create table if not exists public.ingest_items (
  id uuid primary key default gen_random_uuid(),
  -- normalized url (no scheme, no www, no tracking params) — the dedupe key
  url_key text not null unique,
  url text not null,
  source_name text not null,
  source_title text not null,
  source_summary text,
  source_published_at timestamptz,
  bucket text,
  -- seen       — discovered, ranker did not pick it
  -- pending    — picked, waiting for the worker
  -- processing — a worker claimed it
  -- published  — draft article created
  -- failed     — worker gave up after 3 attempts
  -- skipped    — manually dismissed from the admin
  status text not null default 'seen',
  priority integer not null default 0,
  -- the Hebrew angle the ranker suggested, passed on to the writer
  angle text,
  category_hint text,
  attempts integer not null default 0,
  error text,
  article_id uuid references public.articles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingest_items_status_chk
    check (status in ('seen', 'pending', 'processing', 'published', 'failed', 'skipped'))
);

create index if not exists idx_ingest_items_queue
  on public.ingest_items (status, priority desc, source_published_at desc);
create index if not exists idx_ingest_items_created
  on public.ingest_items (created_at desc);

-- ---------------------------------------------------------------------------
-- Run log
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- scan | worker
  trigger text not null default 'cron',     -- cron | manual
  sources_ok integer not null default 0,
  sources_failed integer not null default 0,
  items_seen integer not null default 0,
  items_new integer not null default 0,
  items_queued integer not null default 0,
  articles_created integer not null default 0,
  notes jsonb not null default '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint ingest_runs_kind_chk check (kind in ('scan', 'worker'))
);

create index if not exists idx_ingest_runs_created on public.ingest_runs (created_at desc);

-- ---------------------------------------------------------------------------
-- Attribution columns on articles
-- ---------------------------------------------------------------------------
-- Nullable on purpose: every existing row and every hand-written article keeps
-- working untouched. Only ingested drafts fill these in.
alter table public.articles add column if not exists source_url text;
alter table public.articles add column if not exists source_name text;
alter table public.articles add column if not exists source_published_at timestamptz;

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses the function the rest of the schema already uses)
-- ---------------------------------------------------------------------------
drop trigger if exists update_news_sources_updated_at on public.news_sources;
create trigger update_news_sources_updated_at
  before update on public.news_sources
  for each row execute function public.update_articles_updated_at();

drop trigger if exists update_ingest_items_updated_at on public.ingest_items;
create trigger update_ingest_items_updated_at
  before update on public.ingest_items
  for each row execute function public.update_articles_updated_at();

-- ---------------------------------------------------------------------------
-- Queue claim
-- ---------------------------------------------------------------------------
-- FOR UPDATE SKIP LOCKED so two overlapping worker invocations can never grab
-- the same story and publish it twice.
create or replace function public.claim_ingest_item()
returns public.ingest_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claimed public.ingest_items;
begin
  select * into claimed
  from public.ingest_items
  where status = 'pending' and attempts < 3
  order by priority desc, source_published_at desc nulls last, created_at asc
  limit 1
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update public.ingest_items
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$function$;

revoke all on function public.claim_ingest_item() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS — admin-only. The Edge Functions use the service role and bypass this.
-- ---------------------------------------------------------------------------
alter table public.news_sources enable row level security;
alter table public.ingest_items enable row level security;
alter table public.ingest_runs enable row level security;

drop policy if exists "Admins manage news sources" on public.news_sources;
create policy "Admins manage news sources" on public.news_sources
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage ingest items" on public.ingest_items;
create policy "Admins manage ingest items" on public.ingest_items
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins read ingest runs" on public.ingest_runs;
create policy "Admins read ingest runs" on public.ingest_runs
  as permissive for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- Seed feeds
-- ---------------------------------------------------------------------------
insert into public.news_sources (name, feed_url, homepage, bucket, weight) values
  -- טק כללי
  ('TechCrunch',            'https://techcrunch.com/feed/',                          'https://techcrunch.com',        'general',  9),
  ('The Verge',             'https://www.theverge.com/rss/index.xml',                'https://www.theverge.com',      'general',  8),
  ('Ars Technica',          'https://feeds.arstechnica.com/arstechnica/index',       'https://arstechnica.com',       'general',  8),
  ('Engadget',              'https://www.engadget.com/rss.xml',                      'https://www.engadget.com',      'general',  6),
  ('Wired',                 'https://www.wired.com/feed/rss',                        'https://www.wired.com',         'general',  7),
  -- AI ומחקר
  ('VentureBeat AI',        'https://venturebeat.com/category/ai/feed/',             'https://venturebeat.com',       'ai',       8),
  ('MIT Technology Review', 'https://www.technologyreview.com/feed/',                'https://www.technologyreview.com', 'ai',    9),
  ('The Decoder',           'https://the-decoder.com/feed/',                         'https://the-decoder.com',       'ai',       7),
  ('Hugging Face Blog',     'https://huggingface.co/blog/feed.xml',                  'https://huggingface.co/blog',   'ai',       6),
  -- עסקים והון סיכון
  ('CNBC Technology',       'https://www.cnbc.com/id/19854910/device/rss/rss.html',  'https://www.cnbc.com/technology', 'business', 8),
  ('TechCrunch Venture',    'https://techcrunch.com/category/venture/feed/',         'https://techcrunch.com/category/venture', 'business', 8),
  ('Reuters Technology',    'https://news.google.com/rss/search?q=when:1d+site:reuters.com+technology&hl=en-US&gl=US&ceid=US:en', 'https://www.reuters.com/technology', 'business', 9),
  ('Bloomberg Technology',  'https://news.google.com/rss/search?q=when:1d+site:bloomberg.com+technology&hl=en-US&gl=US&ceid=US:en', 'https://www.bloomberg.com/technology', 'business', 9),
  -- מפתחים וסטארטאפים
  ('Hacker News',           'https://hnrss.org/frontpage?points=200',                'https://news.ycombinator.com',  'dev',      6),
  ('GitHub Blog',           'https://github.blog/feed/',                             'https://github.blog',           'dev',      5),
  ('Stack Overflow Blog',   'https://stackoverflow.blog/feed/',                      'https://stackoverflow.blog',    'dev',      4),
  ('Product Hunt',          'https://www.producthunt.com/feed',                      'https://www.producthunt.com',   'dev',      4)
on conflict (feed_url) do nothing;


-- Schedules the global hi-tech pipeline.
--
--   scan   — three times a day, fills the queue with 4 ranked stories
--   worker — every 5 minutes, drains one story from the queue
--
-- Times are UTC, which is what pg_cron uses. Israel is UTC+3 in summer and
-- UTC+2 in winter, so 03:00 / 10:00 / 17:00 UTC lands on 06:00 / 13:00 / 20:00
-- Israel time between March and October, and an hour earlier in winter. Shift
-- the hours by one in the winter if the exact local hour matters.
--
-- The shared secret lives in Supabase Vault, never in this file. The DO block
-- below mints a random one on first run; read it back and hand the same value
-- to the Edge Functions:
--
--   select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret';
--   supabase secrets set INGEST_CRON_SECRET=<that value>

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ingest_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'ingest_cron_secret',
      'Shared secret pg_cron sends to the ingest Edge Functions'
    );
    raise notice 'created vault secret ingest_cron_secret — run: select decrypted_secret from vault.decrypted_secrets where name = ''ingest_cron_secret'';';
  end if;
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise warning 'supabase_vault is not available — create the secret manually and edit the cron jobs';
end $$;

-- Re-running the migration should not stack duplicate jobs.
do $$
begin
  perform cron.unschedule('agendax-ingest-scan');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('agendax-ingest-worker');
exception when others then null;
end $$;

select cron.schedule(
  'agendax-ingest-scan',
  '0 3,10,17 * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-global-tech',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := jsonb_build_object('limit', 4),
      timeout_milliseconds := 60000
    );
  $cron$
);

-- The worker is intentionally chatty: an empty queue costs one indexed SELECT
-- and returns in milliseconds, and this way a story that failed on its first
-- attempt gets retried within minutes instead of waiting for the next scan.
select cron.schedule(
  'agendax-ingest-worker',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/ingest-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
      ),
      body := jsonb_build_object('max', 1),
      timeout_milliseconds := 30000
    );
  $cron$
);
