# Playbook: צמיחה - תנועה, SEO, עמוד הבית, ניוזלטר

## תנועה

**Q11** - מובילות 7 ימים + מגמה יומית 14 יום. מה מחפשים:
- כתבה עם פי 3 מהחציון = נושא ששווה המשך. להציע כתבת המשך (🔴 - דורש `generate-article`
  מהפאנל, הסוכן לא יכול להפעיל אותה).
- ירידה של 30%+ בשבוע מול הקודם = לדגל.
- `referrer` - מאיפה מגיעים:
  ```sql
  select coalesce(nullif(split_part(regexp_replace(referrer,'^https?://(www\.)?','') ,'/',1),''),'ישיר') as src,
         count(*) from page_views where viewed_at > now() - interval '7 days' group by 1 order by 2 desc limit 10;
  ```

## SEO

- `agendax-sitemap-submit` רץ יומית ב-04:10 UTC. כשל שם = הכתבות לא מוגשות לגוגל.
- כתבה שפורסמה ולא נשלחה ל-`index-article`: הטריגר `google_index_on_publish`
  אמור לכסות. `net._http_response` נשמר **~6 שעות בלבד** - לבדוק רק פרסומים
  מהחלון הזה; מעבר לו `query_logs` על `index-article`.
- ספירת כתובות ב-sitemap: `curl -s https://agendax.co.il/sitemap.xml | grep -c "<loc>"`.
  WebFetch מסכם ולא סופר (החזיר "500" מול 254 אמיתיות ב-09/09).
- **Q16** - כתבות חיות בלי תמונה או עם תקציר דק פוגעות ב-CTR ובכרטיס השיתוף.
- כפילויות כותרת (**Q17**) = קניבליזציה.

## בחירת העורכים

**Q20** - הסקשן הראשי ברייל. שלוש בדיקות: 6 פריטים ליום, אפס חזרות בתוך 10 ימים,
ואפס פריטים בלי נימוק. "היום" = `max(pick_date)`; לפני 05:40 ישראל אין עדיין
בחירה להיום וזה תקין - בודקים את האחרונה. הסקשן נטען בצד הלקוח, WebFetch של
עמוד הבית לא רואה אותו; אימות "באוויר" רק דרך הטבלה. יום חסר = ה-cron לא רץ; האתר מציג את היום הקודם ולכן זה
לא נראה שבור, וזו בדיוק הסיבה לבדוק את זה בשאילתה ולא בעין.

בנייה מחדש של היום (🟢 ירוק - רק כתבות שכבר חיות):

```sql
select net.http_post(
  url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/editors-picks',
  headers := jsonb_build_object('Content-Type','application/json','x-ingest-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ingest_cron_secret')),
  body := $j${"force":true}$j$::jsonb, timeout_milliseconds := 180000);
```

שים לב: `force` חוסם את הבחירה הנוכחית של היום ולכן מחזיר סט **אחר** לגמרי, לא
גרסה משופרת של אותו סט.

## עמוד הבית

**Q13** - `is_featured` ו-`hero_rotation`.
- כתבה מובילה ישנה מ-3 ימים = עמוד בית מעופש. הצעה: `set_featured_article('<id>')` (🔴).
- `refresh_hero_rotation()` רץ ראשון ב-01:00 UTC. אם `picked_at` ישן מ-8 ימים - ה-cron לא רץ.
- `site_settings`: `show_jobs`, `show_courses`, `social_links` - שינוי 🔴.

## ניוזלטר

**Q14** - מתי נשלח לאחרונה, לכמה. כרגע 3 מנויים - עדיין בהרצה.
שליחה היא **תמיד** 🔴, וההצעה חייבת לכלול את הכתבות:
```sql
body := $j${"intro":"<פתיח>","articleIds":["<id1>","<id2>"]}$j$::jsonb
```
בדיקה לפני שליחה אמיתית: `{"testEmail":"support@successcollege.co.il", ...}`.

**כלל:** לא להציע שליחה אם נשלח ניוזלטר ב-5 הימים האחרונים, או אם יש פחות מ-4
כתבות איכותיות מאז השליחה הקודמת.

## מה מדווחים

5 מובילות + מגמה, מקורות תנועה חריגים, מצב עמוד הבית, מתי ניוזלטר אחרון ואם
מומלץ לשלוח.
