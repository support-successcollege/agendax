# ספריית השאילתות

כולן מאומתות מול `kjazrljlfreczicstymr`. הרץ דרך `mcp__supabase__execute_sql`.
זמנים: הגבול היומי הוא חצות **ישראל**, לא UTC.

---

## Q1 - תמונת מצב אחת (הבסיס לכל ריצה)

```sql
with il as (select (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem') as day0)
select
  (select count(*) from articles where is_draft) as drafts,
  (select count(*) from articles where is_draft and scheduled_at is not null) as drafts_scheduled,
  (select count(*) from articles where is_draft and scheduled_at < now() + interval '3 hours') as due_3h,
  (select count(*) from articles where is_draft and scheduled_at is null) as drafts_unscheduled,
  (select count(*) from articles where not is_draft and published_at >= (select day0 from il)) as published_today,
  (select count(*) from articles where not is_draft) as live_total,
  (select count(*) from social_queue where status='queued') as sq_queued,
  (select count(*) from social_queue where status='failed') as sq_failed,
  (select count(*) from social_queue where status='posted' and posted_at >= (select day0 from il)) as sq_posted_today,
  (select count(*) from news_sources where is_active) as sources_active,
  (select count(*) from news_sources where auto_disabled_at is not null) as sources_disabled,
  (select count(*) from newsletter_subscribers) as subscribers;
```

## Q2 - טיוטות שדורשות עריכה (כלל הדילוג של agendax-editor)

```sql
select id, title, category, scheduled_at, created_at, length(content) as len
from articles
where is_draft = true
  and not (content ~* '(אינו מהווה ייעוץ|אינו מהווה תחליף|למטרות מידע והעשרה)'
           and content !~* '<h2[^>]*>\s*(מקורות|קישורים|לקריאה נוספת)</h2>')
order by (scheduled_at is null), scheduled_at asc, created_at desc;
```

## Q3 - מה עולה לאוויר ב-12 השעות הקרובות

`has_own_image = false` = הכתבה תיחסם בשער התמונה (אותו תנאי כמו Q19).

```sql
select id, title, category, scheduled_at at time zone 'Asia/Jerusalem' as slot_il,
       content ~* '(אינו מהווה ייעוץ|אינו מהווה תחליף)' as has_disclaimer,
       (coalesce(image_url,'') <> '' and image_url not like '%photo-1504711434969-e33886168f5c%') as has_own_image
from articles
where is_draft and scheduled_at between now() and now() + interval '12 hours'
order by scheduled_at;
```

## Q4 - טיוטות תקועות בלי תזמון

```sql
select id, title, category, created_at,
       round(extract(epoch from now()-created_at)/3600) as age_hours
from articles where is_draft and scheduled_at is null
order by created_at;
```
הצעת תזמון (🔴 אדום): `update articles set scheduled_at = next_publish_slot(30) where id = '...';`

## Q5 - בריאות ה-ingest ב-24 שעות

```sql
select kind, trigger, count(*) as runs, sum(articles_created) as created,
       sum(items_new) as new_items, sum(sources_failed) as src_failed,
       round(avg(duration_ms)) as avg_ms, max(created_at) as last_run
from ingest_runs where created_at > now() - interval '24 hours'
group by 1,2 order by 1,2;
```

## Q6 - יעד יומי מול בפועל

```sql
select * from ingest_daily_stats();
select * from ingest_category_stats();
```

## Q7 - מקורות מתים

```sql
select name, bucket, last_status, last_item_count,
       last_fetched_at, first_failed_at, auto_disabled_at
from news_sources
where is_active and (last_status is distinct from 'ok' or last_fetched_at < now() - interval '2 days')
order by first_failed_at nulls last limit 30;
```
כיבוי מקור שנכשל 3 ימים (🟢 ירוק): `update news_sources set is_active=false where id='...';`

## Q8 - כשלי cron ב-48 שעות

```sql
select j.jobname, d.status, count(*) as n, max(d.end_time) as last,
       max(left(d.return_message,200)) as sample
from cron.job_run_details d join cron.job j using (jobid)
where d.start_time > now() - interval '48 hours'
group by 1,2 order by (d.status <> 'succeeded') desc, 1;
```

## Q9 - מצב התור החברתי

```sql
select q.status, q.kind, count(*) as n, min(q.scheduled_at) as next
from social_queue q where q.scheduled_at > now() - interval '3 days'
group by 1,2 order by 1,2;

select q.id, a.title, q.platforms, q.kind, q.scheduled_at, q.error, q.result
from social_queue q join articles a on a.id=q.article_id
where q.status='failed' order by q.scheduled_at desc limit 10;
```

## Q10 - כיסוי: כתבות טריות שלא הגיעו לרשתות

```sql
select a.id, a.title, a.published_at, a.category
from articles a
where not a.is_draft and a.category_slug is distinct from 'marketing'
  and a.published_at > now() - interval '3 days'
  and not exists (select 1 from social_queue q where q.article_id=a.id and q.status<>'cancelled')
  and not exists (select 1 from social_posts p where p.article_id=a.id and p.status='posted')
order by a.published_at desc;
```

## Q11 - תנועה: מובילות 7 ימים

```sql
select a.title, a.category, count(*) as views, count(distinct v.visitor_id) as uniques
from page_views v join articles a on a.id=v.article_id
where v.viewed_at > now() - interval '7 days'
group by 1,2 order by views desc limit 10;

select date_trunc('day', viewed_at at time zone 'Asia/Jerusalem')::date as day,
       count(*) as views, count(distinct visitor_id) as uniques
from page_views where viewed_at > now() - interval '14 days' group by 1 order by 1;
```

## Q12 - איזון קטגוריות (7 ימים)

```sql
select coalesce(category,'—') as category, count(*) as n,
       round(100.0*count(*)/sum(count(*)) over (), 1) as pct
from articles where not is_draft and published_at > now() - interval '7 days'
group by 1 order by n desc;
```

## Q13 - עמוד הבית: featured + hero

```sql
select id, title, published_at from articles where is_featured and not is_draft;
select h.rank, a.title, a.published_at, h.picked_at
from hero_rotation h left join articles a on a.id=h.article_id order by h.rank;
```
כתבה מובילה ישנה מ-3 ימים = דגל אדום בדוח (השינוי עצמו 🔴).

## Q14 - ניוזלטר

```sql
select subject, category, recipients_count, test, created_at
from newsletter_sends order by created_at desc limit 5;
select count(*) filter (where true) as total from newsletter_subscribers;
```

## Q15 - ניפוח טבלאות גיבוי

```sql
select tablename, pg_size_pretty(pg_total_relation_size(('public.'||tablename)::regclass)) as size
from pg_tables where schemaname='public' and tablename like 'articles_backup%'
order by tablename;
```
מחיקה 🔴. הכלל המומלץ: לשמור את `articles_backup_20260818` (המלא הראשון) ואת 7 הימים האחרונים.

## Q16 - כתבות פגומות שכבר באוויר (תמונות: ראה Q19)

```sql
select id, title, slug,
       image_url is null as no_image,
       coalesce(length(excerpt),0) < 40 as thin_excerpt,
       length(regexp_replace(content,'<[^>]+>','','g')) as text_len,
       content like '%—%' as has_emdash,
       content ~* '<h2[^>]*>\s*מקורות' as has_sources_block
from articles
where not is_draft and published_at > now() - interval '14 days'
  and (image_url is null or coalesce(length(excerpt),0) < 40
       or length(regexp_replace(content,'<[^>]+>','','g')) < 900
       or content like '%—%' or content ~* '<h2[^>]*>\s*מקורות')
order by published_at desc;
```

## Q19 - כתבות בלי תמונה משלהן (חסומות לפרסום)

```sql
select id, left(title,60) as title, category, is_draft,
       scheduled_at at time zone 'Asia/Jerusalem' as slot_il,
       case when coalesce(image_url,'') = '' then 'אין תמונה' else 'תמונת מלאי גנרית' end as problem,
       round(extract(epoch from now() - coalesce(scheduled_at, created_at))/3600, 1) as waiting_hours
from articles
where coalesce(image_url,'') = ''
   or image_url like '%photo-1504711434969-e33886168f5c%'
order by (is_draft and scheduled_at is not null) desc, scheduled_at, created_at desc;
```

כל שורה כאן היא כתבה ש-`agendax-publish-scheduled` **מסרב לפרסם**. הסריקה
האוטומטית (`agendax-article-image`, כל 5 דקות, כתבה אחת בכל ריצה) אמורה לנקות
אותן. `waiting_hours` מעל 1 עם יותר מכתבה אחת תקועה = הסריקה נכשלת - לבדוק:

```sql
select r.status_code, left(r.content, 400) from net._http_response r
where r.created > now() - interval '30 minutes' order by r.created desc limit 5;
```

## Q17 - כפילויות

```sql
select lower(regexp_replace(title,'\s+',' ','g')) as t, count(*), array_agg(id)
from articles where created_at > now() - interval '14 days'
group by 1 having count(*) > 1;
```

## Q20 - בחירת העורכים: האם היא באמת מתחלפת

```sql
select p.pick_date, count(*) as picks,
       count(distinct a.category) as categories,
       count(*) filter (where p.note is null or p.note = '') as without_note,
       count(*) filter (where a.published_at > p.pick_date - interval '2 days') as fresh
from editors_picks p join articles a on a.id = p.article_id
group by p.pick_date order by p.pick_date desc limit 10;
```

מה לחפש: **`picks` תמיד 6**; `categories` 3 ומעלה; `without_note` 0 (ערכים
גבוהים = המודל נכשל והמערכת נפלה לבחירה הדטרמיניסטית); יום חסר ברצף = ה-cron
`agendax-editors-picks` לא רץ, והאתר מציג את היום הקודם.

חזרות בין ימים - אמורות להיות 0 בתוך חלון של 10 ימים:

```sql
select a.title, count(distinct p.pick_date) as times, min(p.pick_date), max(p.pick_date)
from editors_picks p join articles a on a.id = p.article_id
where p.pick_date > current_date - 10
group by a.title having count(distinct p.pick_date) > 1;
```

## Q18 - רישום הריצה

```sql
insert into manager_runs (kind, summary, report_md, proposals, status)
values ('daily', $j${"drafts":21}$j$::jsonb, $md$<הדוח>$md$, $j$[]$j$::jsonb, 'reported')
returning id;
```

---

**טיפ:** ציטוט טקסט עברי ב-SQL - להשתמש ב-dollar quoting (`$ax$...$ax$`) ולא בגרשיים.
