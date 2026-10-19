# Playbook: תוכן

אחראי על: טיוטות, עריכה, תזמון, איזון קטגוריות, איכות של מה שכבר באוויר.

## סדר הבדיקות

1. **Q2** - מי דורש עריכה. אם יש: הפעל את הסקיל `agendax-editor`. אל תערוך ידנית
   ואל תשכפל את הכללים שלו - הוא הבעלים של הניקוי.
   עדיפות: מתוזמנות בתוך 3 שעות → מתוזמנות → ללא תזמון.
2. **Q3** - מה עולה ב-12 השעות הקרובות. כל כתבה עוברת את הצ'ק-ליסט למטה.
   כתבה שנכשלת בקריטריון קריטי → **המלצה לדחות את התזמון** (הצעה אדומה, לא ביצוע).
3. **Q4** - טיוטות תקועות בלי תזמון. יותר מ-10 = לדגל בדוח.
   **אפס כתבות מתוזמנות** (Q1 `drafts_scheduled = 0`) = דגל אדום בפני עצמו: המפרסם
   לא יעלה כלום מחר. ההצעה הראשונה בדוח היא תזמון הטיוטות שעוברות את הצ'ק-ליסט.
4. **Q12** - איזון קטגוריות. קטגוריה מעל 45% או קטגוריה פעילה עם 0 בשבוע = לדגל.
5. **Q19** - כתבות בלי תמונה משלהן. כל כתבה כזו **חסומה לפרסום**. הפעולה:
   הרצת `article-image` עליה (🟢 ירוק). אם היא נכשלת - לבדוק איזה מודל תמונה
   פעיל, ולדווח.
6. **Q16** - כתבות חיות פגומות (תקציר דק, מקף ארוך, בלוק מקורות ששרד).
7. **Q17** - כפילויות כותרת ב-14 יום.

## צ'ק-ליסט לכתבה שעולה לאוויר

| קריטריון | סף | קריטי? |
|---|---|---|
| פסקת דיסקליימר | קיימת | ✅ קריטי |
| בלוק `<h2>מקורות</h2>` | **לא** קיים | ✅ קריטי |
| מקף ארוך `—` | 0 מופעים | ✅ קריטי |
| קישורים חיצוניים `<a href` | 0 | ✅ קריטי |
| `image_url` | תמונה משלה - לא ריק, לא תמונת המלאי הגנרית | ✅ קריטי - חוסם פרסום |
| אורך טקסט נקי | 500-850 מילים | אזהרה |
| כותרות ביניים `<h2>` | 3+ | אזהרה |
| תקציר | 40+ תווים | אזהרה |
| כותרת מול תוכן | תואמת | אזהרה |

## תרגומי מכונה שגויים - לחפש בכל ריצה

`generate-article` חוזר על אלה. תיקון בטיוטה = 🟢 ירוק.

| בטיוטה | הנכון |
|---|---|
| ממוטב (tokenized) | מטוקן |
| חומרה (firmware) | קושחה - **רק** כשההקשר הוא firmware. "חומרה" במובן hardware או severity נכונה ונפוצה (3 false positives ב-09/09) |
| מופשט (intangible) | בלתי מוחשי |
| בוגרים (adults) | מבוגרים |
| אנלוגי (analogous) | דומה |
| מפחית (filters out) | מסלק |
| מטמון מקשיים-ערכים | מטמון מפתח-ערך |
| "העיר" במקום Rural bank | בנק כפרי |

וגם: תווים זרים ששתולים בתוך מילה עברית (`ال`, `權`) - חיפוש
`content ~ '[؀-ۿ一-鿿]'`.

## תמונות - אין כתבה בלי תמונה משלה

סדר העדיפות שהמערכת מנסה: תצלום המקור (ממוקמר לבאקט שלנו) → יצירה ב-Gemini →
**כלום**. תמונת המלאי הגנרית כבר לא נחשבת לתמונה: `agendax-publish-scheduled`
מדלג על כתבה שנושאת אותה, ו-`agendax-article-image` (כל 5 דקות) מייצר לה תמונה
אמיתית ומשחרר אותה.

תיקון ידני לכתבה בודדת (🟢 ירוק - לא מפרסם כלום):

```sql
select net.http_post(
  url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/article-image',
  headers := jsonb_build_object('Content-Type','application/json','x-ingest-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ingest_cron_secret')),
  body := $j${"articleId":"<uuid>"}$j$::jsonb, timeout_milliseconds := 200000);
```

הוספת `"force": true` מחליפה גם תמונה קיימת - רק אם יניב ביקש.

**כשהיצירה נכשלת בכל המודלים** זו לא בעיה של הכתבה אלא של הספק. הפונקציה מחזירה
את רשימת הכשלים המלאה; 503 על כל המודלים = עומס אצל Google, לנסות שוב מאוחר יותר.
404 על מודל = השם שלו השתנה, ואז צריך לעדכן את `GEMINI_IMAGE_MODEL`.

## תזמון

`next_publish_slot(30)` מחזיר את הסלוט הפנוי הבא (חלון 06:00-24:00 ישראל, קפיצות
30 דקות, מתגלגל למחר כשהיום מלא). כל שינוי `scheduled_at` הוא 🔴 - מציעים, לא מבצעים.

**קצב:** לפי `select daily_target, weekend_target from ingest_config` (09/09: 2 בחול). לא לקבוע מהזיכרון. אם Q6 מראה
שהיעד לא הושג יומיים ברצף - זו בעיה של המקורות או של ה-worker, לא של התזמון.

## ארכוב טיוטות ישנות (🟢 מ-19/10/2026)

טיוטה מעל 14 יום, `review_score` 6 ומטה (או ריק), בלי `scheduled_at` - לא תעלה לעולם. ב-19/10 נוקו 121 כאלה
(167 טיוטות ירדו ל-46). הנוהל, בדיוק ככה:

```sql
insert into articles_archive (id, title, slug, category, was_draft, published_at, created_at, last_seen_in, versions_found, data)
select id, title, slug, category, true, published_at, created_at, 'cleanup_' || to_char(now() at time zone 'Asia/Jerusalem', 'YYYYMMDD'), 1, to_jsonb(a)
  from articles a
 where is_draft and scheduled_at is null and created_at < now() - interval '14 days' and coalesce(review_score, 0) <= 6
 order by created_at limit 50
on conflict (id) do nothing;
delete from articles a using articles_archive x
 where x.id = a.id and x.last_seen_in = 'cleanup_' || to_char(now() at time zone 'Asia/Jerusalem', 'YYYYMMDD')
   and a.is_draft and a.scheduled_at is null;
```

שחזור: `insert into articles select * from jsonb_populate_record(null::articles, (select data from articles_archive where id = '<id>'));`
מקסימום 50 בריצה (מגבלת הירוק). מדווחים: "ארכבתי N טיוטות".

## מה מדווחים

מספרים בלבד + רשימת הכותרות שנערכו + הצעות אדומות ממוספרות. **לא** להחזיר תוכן
כתבות לסוכן הראשי.
