-- A named, declared AI newsroom.
--
-- Every article on the site says "מערכת Agendax" and leads nowhere. That is the
-- exact shape Google's scaled-content-abuse policy is written against: bulk
-- publishing with no accountable byline, on a domain three weeks old.
--
-- The answer is not to hide the machine, it is to name it. Each agent gets a
-- beat it actually covers, a page that states what it is, which models write
-- it, what it may and may not do, and who reviews it. Readers get something to
-- judge; Google gets an author entity to attach reputation to.
--
-- Deliberately NOT done here: inventing people. No human names, no portraits,
-- no fabricated CVs. An agent that pretended to be a journalist would be the
-- deception the policy is actually about, and one screenshot would end the
-- site's credibility.

create table if not exists public.authors (
  slug            text primary key,
  name            text        not null,
  -- 'ai' writes under machine authorship; 'human' is left available for real
  -- staff bylines later. Nothing may claim to be human without being human.
  kind            text        not null default 'ai' check (kind in ('ai', 'human')),
  role            text        not null,
  -- One line under the name, e.g. "מסקר מודלים, מחקר ורגולציה של AI".
  beat            text,
  bio             text        not null default '',
  -- Kept from an earlier draft of the profiles; nothing renders it.
  method          text        not null default '',
  -- The closing line on the profile, above the link to the AI policy.
  model_note      text        not null default '',
  avatar_url      text,
  -- Which categories route to this agent. Empty = never auto-assigned.
  category_slugs  text[]      not null default '{}',
  is_active       boolean     not null default true,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.authors enable row level security;

-- The byline is on every public page, so anonymous read is the point.
drop policy if exists "Anyone reads active authors" on public.authors;
create policy "Anyone reads active authors" on public.authors
  as permissive for select to anon, authenticated
  using (is_active);

drop policy if exists "Admins manage authors" on public.authors;
create policy "Admins manage authors" on public.authors
  as permissive for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- `articles.author` stays as the display string so nothing breaks mid-deploy;
-- the slug is what links a story to a profile.
alter table public.articles
  add column if not exists author_slug text references public.authors(slug) on delete set null;

create index if not exists articles_author_slug_idx
  on public.articles (author_slug, published_at desc);

-- ---------------------------------------------------------------- the agents
-- Names are deliberately not personal names. "נוירון" cannot be mistaken for a
-- person; "דניאל לוי" could, and that mistake is the whole risk.
insert into public.authors (slug, name, kind, role, beat, bio, method, model_note, avatar_url, category_slugs, sort_order)
values
  (
    'neuron',
    'נוירון',
    'ai',
    'סוכן כתיבה · בינה מלאכותית',
    'מודלים חדשים, מחקר, רגולציה וכלי AI',
    'נוירון הוא סוכן הכתיבה של Agendax בתחום הבינה המלאכותית. הוא עוקב אחרי הודעות המעבדות הגדולות, מאמרי מחקר, שינויי רגולציה והשקות מוצר — ומתרגם אותם לעברית ברורה, עם ההקשר שחסר בהודעה לעיתונות.',
    'נוירון עוקב אחרי מקורות רבים בתחום, מזהה מה חדש באמת, ומצליב כל ידיעה מול המקור הראשוני לפני שהוא כותב. הוא מצטט את המקור בכל כתבה, מסמן במפורש מה עדיין לא אושר, ואינו כותב על שמועה שאין לה מקור בעל שם. כתבה שהחומר שלה דל מדי — הוא לא כותב אותה.',
    'כתבה שחתומה בשם הזה נכתבה על ידי סוכן AI של Agendax. האחריות על התוכן היא של המערכת.',
    '/authors/neuron.svg',
    array['ai'],
    1
  ),
  (
    'code',
    'קוד',
    'ai',
    'סוכן כתיבה · הייטק',
    'חברות טכנולוגיה, מוצרים, סייבר ותשתיות',
    'קוד הוא סוכן הכתיבה של Agendax בתחום ההייטק. הוא מסקר את מה שחברות הטכנולוגיה משחררות, שוברות ומתקנות — ממוצרים והשקות ועד פרצות אבטחה ותשתיות ענן.',
    'קוד עובד מהודעות רשמיות, מתיעוד טכני ומדיווחי אבטחה, ומעדיף תמיד את המקור על פני הסיקור עליו. בכל כתבה הוא מפריד בין מה שהחברה הודיעה לבין מה שנבדק בפועל, ומקשר למקור כדי שאפשר יהיה לבדוק אחריו.',
    'כתבה שחתומה בשם הזה נכתבה על ידי סוכן AI של Agendax. האחריות על התוכן היא של המערכת.',
    '/authors/code.svg',
    array['hightech'],
    2
  ),
  (
    'algo',
    'אלגו',
    'ai',
    'סוכן כתיבה · שוק ההון',
    'דוחות, מניות טכנולוגיה, מאקרו ומגמות שוק',
    'אלגו הוא סוכן הכתיבה של Agendax בשוק ההון. הוא מסקר דוחות כספיים, תנועות מניות בענף הטכנולוגיה ונתוני מאקרו שמשפיעים עליהן.',
    'אלגו מדווח מספרים מהמקור בלבד — דוח, הודעת בורסה או נתון רשמי — ומציין תמיד את מועד הנתון. הוא מתאר מה קרה ולמה, ואינו נותן המלצות קנייה או מכירה. שום דבר שהוא כותב אינו ייעוץ השקעות.',
    'כתבה שחתומה בשם הזה נכתבה על ידי סוכן AI של Agendax. האחריות על התוכן היא של המערכת.',
    '/authors/algo.svg',
    array['companies'],
    3
  ),
  (
    'manof',
    'מנוף',
    'ai',
    'סוכן כתיבה · פיתוח עסקי',
    'גיוסים, אקזיטים, סטארטאפים וכלכלת הטכנולוגיה',
    'מנוף הוא סוכן הכתיבה של Agendax בפיתוח עסקי. הוא עוקב אחרי סבבי גיוס, אקזיטים, מיזוגים ורכישות והתנועה של הכסף בתעשיית הטכנולוגיה — בישראל ובעולם.',
    'מנוף מאמת כל סכום גיוס מול הודעה רשמית או מול מקור פיננסי בעל שם, ומציין במפורש כשסכום הוא הערכה ולא מספר מאושר. עסקה שלא אושרה על ידי אף צד מסומנת ככזו.',
    'כתבה שחתומה בשם הזה נכתבה על ידי סוכן AI של Agendax. האחריות על התוכן היא של המערכת.',
    '/authors/manof.svg',
    array['markets'],
    4
  )
on conflict (slug) do nothing;

-- ------------------------------------------------------------------ backfill
-- Existing stories get the agent that covers their category, so the archive
-- carries the same accountability the new stories will.
update public.articles a
   set author_slug = t.slug,
       author      = t.name
  from public.authors t
 where a.author_slug is null
   and a.category_slug = any (t.category_slugs);

-- Anything outside the four beats (marketing pieces, the odd manual post)
-- stays with the newsroom byline rather than being attributed to an agent that
-- did not write it.
update public.articles
   set author = 'מערכת Agendax'
 where author_slug is null;

-- ------------------------------------------------------- pace, not just proof
-- Twelve stories a day from a domain three weeks old reads as volume for its
-- own sake, whoever signed them. Two per category leaves the same categories
-- covered with room to make each piece worth the byline it now carries.
update public.ingest_config set daily_target = 2;
