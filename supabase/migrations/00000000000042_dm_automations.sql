-- "הגיבו גוגל ואשלח לכם את הכתבה" — the comment-to-DM automation.
--
-- Meta's own Instagram app has this as a feature; the API has no such object,
-- so a rule is a row here and the sending is ours: a comment arrives on the
-- webhook, we match its text against the rules armed for that exact post, and
-- answer the commenter privately with the article's link.
--
-- What the platforms allow, and therefore what this must respect:
--   * a private reply is permitted once per comment, within 7 days of it —
--     hence expires_at, and hence the one-row-per-comment ledger below, which
--     is the dedupe (a webhook delivery is retried until it is acknowledged);
--   * the reply must be triggered by that person's comment. Nothing here
--     messages anyone who did not comment first.

-- --------------------------------------------------------------- the rules
create table if not exists public.social_automations (
  id            uuid        primary key default gen_random_uuid(),
  article_id    uuid        not null references public.articles(id) on delete cascade,
  -- Which network's post this rule watches. A post and its story are separate
  -- rules, because they are separate media ids on Meta's side.
  platform      text        not null
                check (platform in ('instagram', 'facebook', 'instagram_story', 'facebook_story')),
  -- The media/post id the network returned when we published it. The rule only
  -- answers comments on this one post — which is why two articles may safely
  -- use the same keyword.
  post_external_id text,
  -- What to listen for. First entry is the word the post asks for; the rest are
  -- accepted spellings (English/Hebrew, with or without a space).
  keywords      text[]      not null default '{}'::text[],
  -- The private reply. {title} and {link} are filled per send.
  message       text        not null default '',
  -- The public answer under the comment, so other readers see it worked.
  -- Empty = no public reply.
  public_reply  text        not null default '',
  link_url      text        not null default '',
  status        text        not null default 'active'
                check (status in ('active', 'paused', 'expired')),
  -- Past this, Meta refuses the private reply anyway.
  expires_at    timestamptz not null default now() + interval '7 days',
  matched_count int         not null default 0,
  sent_count    int         not null default 0,
  last_event_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One rule per published post. Re-publishing the same article to the same
  -- network replaces the rule rather than adding a competing one.
  unique (platform, post_external_id)
);

create index if not exists social_automations_live_idx
  on public.social_automations (status, expires_at desc);
create index if not exists social_automations_article_idx
  on public.social_automations (article_id, created_at desc);

-- ------------------------------------------------------------- the ledger
-- One row per comment we were told about, inserted before anything is sent.
-- The unique key is the whole safety mechanism: Meta retries a delivery it did
-- not get an acknowledgement for, and a person must not be messaged twice for
-- one comment.
create table if not exists public.social_automation_events (
  comment_id    text        primary key,
  automation_id uuid        references public.social_automations(id) on delete set null,
  platform      text        not null,
  -- Scoped id of the commenter, as the platform gives it. Kept to answer
  -- "did we already serve this person" and nothing else.
  sender_id     text,
  comment_text  text,
  matched       boolean     not null default false,
  sent          boolean     not null default false,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists social_automation_events_recent_idx
  on public.social_automation_events (created_at desc);

alter table public.social_automations enable row level security;
alter table public.social_automation_events enable row level security;

drop policy if exists "Admins manage automations" on public.social_automations;
create policy "Admins manage automations" on public.social_automations
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins read automation events" on public.social_automation_events;
create policy "Admins read automation events" on public.social_automation_events
  as permissive for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- ----------------------------------------------------------- the settings
alter table public.social_settings
  -- Off = no post is published with a "comment X" line and no rule is armed.
  -- Existing posts keep working until they expire.
  add column if not exists dm_automation boolean not null default false,
  -- Also answer publicly under the comment ("בדרך אליך בפרטי 📩"), so the
  -- next reader sees that commenting does something.
  add column if not exists dm_public_reply boolean not null default true,
  add column if not exists dm_window_days int not null default 7
      check (dm_window_days between 1 and 7),
  add column if not exists dm_message_template text not null default
      E'היי! הנה הכתבה המלאה 📩\n\n{title}\n{link}';

comment on column public.social_settings.dm_automation is
  'Meta: פוסט נושא "הגיבו <מילה>" ומי שמגיב מקבל את הקישור בפרטי';

-- ------------------------------------------------------------- the counters
-- Incremented from the webhook, which may be handling several comments on one
-- rule at once; doing it in SQL keeps the count right without the function
-- reading, adding and writing back.
create or replace function public.bump_automation(p_id uuid, p_sent boolean)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.social_automations
     set matched_count = matched_count + 1,
         sent_count = sent_count + case when p_sent then 1 else 0 end,
         last_event_at = now(),
         updated_at = now()
   where id = p_id;
$$;

revoke all on function public.bump_automation(uuid, boolean) from public, anon, authenticated;

-- -------------------------------------------------------------- the keys
-- Two values the webhook needs, pasted in the panel like the provider keys:
-- the app secret (to verify that a delivery really came from Meta) and the
-- verify token (the handshake when the callback URL is registered).
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
    'AI_PRIMARY',
    'META_APP_SECRET',
    'META_VERIFY_TOKEN'
  ];
$$;

-- ---------------------------------------------------------- the expiry job
-- A rule past its window cannot send anything (Meta refuses), so it is closed
-- rather than left looking live in the panel.
do $$ begin perform cron.unschedule('agendax-dm-automation-expire'); exception when others then null; end $$;
select cron.schedule(
  'agendax-dm-automation-expire',
  '7 * * * *',
  $cron$
    update public.social_automations
       set status = 'expired', updated_at = now()
     where status = 'active' and expires_at < now();
  $cron$
);
