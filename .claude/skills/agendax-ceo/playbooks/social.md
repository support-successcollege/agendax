# Playbook: רשתות חברתיות

פלטפורמות מחוברות: Facebook, Instagram, LinkedIn (auto_publish פעיל). X מכובה.
מכסה: `social_settings.posts_per_day` בשעות `publish_hours` (ישראל).

## סדר הבדיקות

1. **Q9** - התפלגות התור + הכשלים. לכל כשל: לקרוא את `error` ואת `result`
   (מערך פר-פלטפורמה) ולסווג:
   | סוג שגיאה | פירוש | מה עושים |
   |---|---|---|
   | טוקן/הרשאה (`OAuth`, `expired`, `permission`) | הפג תוקף החיבור | **לדגל ליניב** - רק הוא יכול לחדש בפאנל |
   | תמונה (`image`, `render`, `546`) | ה-prerender נכשל | להציע הרצה חוזרת של `social-image` (🔴) |
   | rate limit | חריגה זמנית | להציע הרצה חוזרת של הפריט (🔴) |
   | הכתבה נמחקה/טיוטה | הפריט מיותם | ביטול הפריט (🟢) |
2. **Q10** - כיסוי. כתבה טרייה שלא נכנסה לתור ולא פורסמה: אם `auto_fill` פעיל,
   זה אומר שכל הסלוטים תפוסים או שהיא כבר "טופלה" בעבר. יותר מ-3 כאלה ביומיים =
   להציע העלאת `posts_per_day` או הוספה ידנית לתור (🔴).
3. **פריטים תקועים ב-`publishing`** מעל 30 דקות - סוכן שנפל באמצע:
   ```sql
   select id, article_id, scheduled_at, updated_at from social_queue
   where status='publishing' and updated_at < now() - interval '30 minutes';
   ```
   ביטול (🟢) ואז הצעה להריץ מחדש (🔴).
4. **כפילויות בתור** - שתי שורות לאותה כתבה באותו kind: לבטל את המאוחרת (🟢).

## פרסום - תמיד אדום

```sql
-- פריט קיים מהתור, עכשיו
select net.http_post(url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/social-publish',
  headers := jsonb_build_object('Content-Type','application/json','x-ingest-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ingest_cron_secret')),
  body := $j${"queueId":"<uuid>"}$j$::jsonb, timeout_milliseconds := 150000);

-- כתבה ספציפית, מיידי
body := $j${"articleId":"<uuid>","platforms":["facebook","instagram","linkedin"],"kind":"post"}$j$::jsonb
```
`kind:"story"` עובד רק ב-Facebook/Instagram. `force:true` עוקף את חסימת הכפילות -
רק אם יניב ביקש במפורש.

## תמונות

`social-image` שומר ב-storage תחת `social/{id}.png` ו-`social/{id}-story.png`,
ו-cron `5,35 * * * *` מכין אותן מראש. אם פוסט יצא עם התמונה הגולמית של הכתבה
במקום המיתוגית - זה כשל render שנרשם בלוג, שווה דיגול.

## מה מדווחים

בתור / פורסמו היום / נכשלו + סיווג הכשלים + פערי כיסוי. הצעות ממוספרות.
