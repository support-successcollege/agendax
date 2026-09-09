# Playbook: בריאות המערכת

אחראי: `agendax-health`. crons, ingest, מקורות, שגיאות HTTP, גיבויים, advisors.

## סדר הבדיקות

1. **Q8** - כשלי cron ב-48 שעות. כל `status <> 'succeeded'` = ממצא.
   `net.http_post` מצליח גם כשהפונקציה מחזירה 500 - ה-cron ירוק והפונקציה נפלה. לכן גם:
   ```sql
   select r.id, r.status_code, left(r.content,300), r.created
   from net._http_response r
   where r.created > now() - interval '24 hours' and r.status_code >= 400
   order by r.created desc limit 20;
   ```
2. **Q5 + Q6** - ingest: כמה רצו, כמה נוצרו, מול היעד. `articles_created = 0`
   ביותר מ-6 שעות עם תור לא ריק = ה-worker תקוע - **אלא אם** היעד היומי כבר
   מולא: `net._http_response` של `ingest-worker` מחזיר `remaining` ו-`dailyTarget`;
   `remaining: 0` = שקט מכוון. `ingest_runs` רושם רק ריצות עם פעולה.
   `ingest_daily_stats()` סופר לפי יום ישראל - בריצה אחרי חצות ולפני 06:00 המונה
   של "היום" תמיד ~0; להסתכל על אתמול.
   ```sql
   select count(*) filter (where status='pending') as pending,
          count(*) filter (where attempts >= 3) as burned
   from ingest_items where created_at > now() - interval '3 days';
   select count(*) as buffer_rows, max(scanned_at) as newest from ingest_scan_buffer;
   ```
   באפר ריק אחרי דקה 2 של השעה = ה-shards לא רצו.
3. **Q7** - מקורות. מקור שנכשל 3 ימים ברצף: כיבוי (🟢) + דיווח. ירידה של יותר
   מ-10% במקורות הפעילים בשבוע = לדגל.
   **מעצור כשל מתואם:** לפני כל כיבוי, קבץ לפי `first_failed_at` בדיוק דקה:
   ```sql
   select date_trunc('minute', first_failed_at) as t, count(*) as n,
          array_agg(left(last_status,12)) as statuses
   from news_sources where is_active and first_failed_at is not null
   group by 1 having count(*) >= 5 order by 1 desc;
   ```
   5+ מקורות שנפלו באותה דקה = הבעיה אצלנו (User-Agent, IP יציאה, deploy), לא
   אצלם. **לא מכבים אף אחד מהקבוצה** - הצעה 🔴 לחקור את הפריסה שקדמה לרגע הזה
   (`list_edge_functions` → `updated_at`). Why: ב-06/09 09:29 UTC נפלו 28 מקורות
   ב-403 יחד, כולל כל הישראליים, מיד אחרי פריסת `ingest-scan-shard`.
   `ingest_runs.notes` הוא jsonb: `left(notes::text, 200)`.
4. **Q15** - ניפוח גיבויים. מדיניות שיניב אישר ב-31/08: לשמור את
   `articles_backup_20260818` (הגיבוי המלא הראשון) ואת 7 הימים האחרונים. השאר -
   הצעת מחיקה (🔴) עם רשימת השמות המדויקת.
5. **Advisors** - `mcp__supabase__get_advisors` עם `security` ואז `performance`.
   אינדקס חסר או RLS פתוח = ממצא לדיווח, לא לתיקון עצמאי (🔴).
   `performance` מחזיר ~80K תווים וחורג מגבול הכלי; התוצאה נשמרת לקובץ שהכלי
   מציין - לספור לפי `name` (`auth_rls_initplan`, `multiple_permissive_policies`,
   `unindexed_foreign_keys`…) ולא להדביק. מדווחים מספרים לכל סוג + 3 דוגמאות.
6. **Logs** - `mcp__supabase__query_logs` לשירות `edge-function` רק כשיש ממצא
   ספציפי לחקור. לא בכל ריצה.
7. **סודות ומודלים** - אם `net._http_response` מראה 503/404 מ-Gemini: לבדוק איזה
   מודל נכשל ולהציע החלפת הסוד (🔴, `supabase secrets set`).

## מה נחשב "המערכת חיה"

| סימן | סף תקין |
|---|---|
| `agendax-ingest-worker` | רץ ב-10 הדקות האחרונות |
| `agendax-publish-scheduled` | רץ ב-10 הדקות האחרונות |
| `agendax-social-publish` | רץ ב-10 הדקות האחרונות |
| `agendax-scan-shard-0..5` | 6 ריצות מוצלחות בשעה האחרונה |
| `agendax-ingest-rank` | ריצה בשעה האחרונה |
| כתבות שנוצרו היום | ≥ `ingest_config.daily_target` (או `weekend_target` בשישי-שבת) |
| מקורות פעילים | ≥ 800 |
| `net._http_response` עם 4xx/5xx ב-24ש' | 0 |
| `articles_backup_*` | ≤ 9 טבלאות |

## מה מדווחים

שורה לכל cron חריג, ingest מול היעד, מקורות שכובו, advisors. אם הכל תקין -
שורה אחת: "כל ה-crons ירוקים, ingest N/M, אין שגיאות HTTP, N גיבויים."
