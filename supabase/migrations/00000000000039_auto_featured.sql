-- מיגרציה 39: החלפה אוטומטית של הכתבה המובילה (featured) בעמוד הבית.
--
-- למה: הדגל is_featured מוחלף רק ידנית מפאנל האדמין (set_featured_article),
-- ובפועל אותה כתבה ישבה בראש העמוד 9 ימים. הכתבה המובילה היא מה שנאפה
-- ל-HTML הסטטי של עמוד הבית ומה שגוגל רואה, אז היא צריכה להתחלף לבד.
--
-- מה:
-- 1. טבלת יומן public.featured_log: מי היה featured ומתי. RLS מופעל בלי
--    policies, כלומר רק service_role ופונקציות SECURITY DEFINER נוגעות בה.
--    היומן מונע חזרה על כתבה שכבר הייתה מובילה ב-48 השעות האחרונות.
-- 2. פונקציה public.auto_featured_article(): בוחרת מועמדת חיה עם תמונה
--    משלה (לא תמונת המלאי), לא marketing, שאינה המובילה הנוכחית, מ-72 השעות
--    האחרונות (ואם אין - מ-7 הימים האחרונים). עדיפות: is_breaking, ואז הכי
--    הרבה צפיות ב-24 שעות, ואז published_at יורד. מפעילה את
--    set_featured_article הקיימת (לא משכפלת אותה) ורושמת שורה ביומן.
--    מחזירה את ה-id שנבחר, או null אם אין מועמדת (ואז לא משנה כלום).
-- 3. cron agendax-auto-featured: ארבע פעמים ביום, 10 דקות לפני
--    agendax-site-rebuild (03/15 UTC) כדי שההחלפה תיכנס לבנייה הקרובה;
--    בשתי הריצות האחרות (08:50/20:50) ההחלפה נכנסת לבנייה של 11/23 UTC.

-- 1. יומן הכתבות המובילות
create table if not exists public.featured_log (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.articles(id) on delete cascade,
  featured_at timestamptz not null default now(),
  picked_by text not null default 'auto'
);

create index if not exists featured_log_article_at_idx
  on public.featured_log (article_id, featured_at desc);

alter table public.featured_log enable row level security;
-- בכוונה בלי policies: אין קריאה או כתיבה מהדפדפן.

-- הכתבה שיושבת עכשיו כמובילה (הוחלפה ידנית) נכנסת ליומן פעם אחת,
-- כדי שהריצה הראשונה לא תחזור אליה תוך 48 שעות אחרי שתוחלף.
insert into public.featured_log (article_id, picked_by)
select a.id, 'seed'
  from public.articles a
 where a.is_featured
   and not exists (select 1 from public.featured_log l where l.article_id = a.id);

-- 2. הבחירה האוטומטית
create or replace function public.auto_featured_article()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _current uuid;
  _pick    uuid;
  _window  interval;
begin
  select id into _current from public.articles where is_featured limit 1;

  -- קודם 72 שעות; אם אין מועמדת, מרחיבים ל-7 ימים.
  foreach _window in array array['72 hours'::interval, '7 days'::interval] loop
    select a.id
      into _pick
      from public.articles a
      left join lateral (
        select count(*) as views
          from public.page_views v
         where v.article_id = a.id
           and v.viewed_at >= now() - interval '24 hours'
      ) v on true
     where not a.is_draft
       and a.published_at is not null
       and a.published_at <= now()
       and a.published_at >= now() - _window
       and coalesce(a.image_url, '') <> ''
       and a.image_url not like '%photo-1504711434969-e33886168f5c%'
       and a.category_slug <> 'marketing'
       and (_current is null or a.id <> _current)
       and not exists (
         select 1
           from public.featured_log l
          where l.article_id = a.id
            and l.featured_at >= now() - interval '48 hours'
       )
     order by a.is_breaking desc nulls last, v.views desc, a.published_at desc
     limit 1;

    exit when _pick is not null;
  end loop;

  if _pick is null then
    return null;
  end if;

  perform public.set_featured_article(_pick);
  insert into public.featured_log (article_id, picked_by) values (_pick, 'auto');
  return _pick;
end;
$$;

revoke execute on function public.auto_featured_article() from public, anon, authenticated;
grant  execute on function public.auto_featured_article() to service_role;

-- 3. cron: 10 דקות לפני הבנייה של 03:00 ו-15:00 UTC, ובאמצע ביניהן.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendax-auto-featured') then
    perform cron.unschedule('agendax-auto-featured');
  end if;
end;
$$;

select cron.schedule(
  'agendax-auto-featured',
  '50 2,8,14,20 * * *',
  $$select public.auto_featured_article();$$
);
