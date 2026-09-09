-- פיזור ששת ה-shards של הסריקה על פני השעה.
--
-- מה: agendax-scan-shard-0..5 רצו כולם בדקה :02. מעכשיו כל אחד בדקה משלו
-- (2, 10, 18, 26, 34, 42), וה-ranker (agendax-ingest-rank) זז מ-:08 ל-:50 כדי
-- שימשיך לרוץ רק אחרי שכל ה-shards סיימו למלא את ingest_scan_buffer.
--
-- למה: ברגע הפריסה של ingest-scan-shard (06/09 09:29 UTC) כ-28 מקורות התחילו
-- להחזיר HTTP 403 - כולם באותן שתי שניות. מהמחשב המקומי אותם פידים חוזרים 200
-- עם אותם headers בדיוק. ההסבר היחיד שמתאים לזמן: שישה shards שפותחים ~150
-- חיבורים כל אחד באותו רגע, מאותה כתובת יציאה, נראים לאתרים כמתקפה ולא כקורא
-- RSS. חלק מהאתרים (גיקטיים, Robot Report) קיבלו כמה פידים שלהם באותה שנייה
-- מ-shards שונים - דבר שרק פיזור על פני השעה פותר, לא הגבלה בתוך shard בודד.
--
-- חלון הבאפר של ה-ranker הוא 90 דקות, כך שב-:50 הוא רואה את כל ששת ה-shards
-- של השעה הנוכחית (:02 עד ~:43). הוא רואה גם את שאריות ה-shards המאוחרים של
-- השעה הקודמת (:26, :34, :42) - אין בזה נזק: אותם url_key כבר בלדג'ר כ-seen
-- או בתור, וה-ranker מסנן אותם ממילא.
--
-- אידמפוטנטית: unschedule (בבליעת שגיאה אם לא קיים) ואז schedule, לכל job.

do $$
declare
  shard_count constant int := 6;
  -- דקת הריצה של כל shard, לפי אינדקס. 8 דקות בין shard ל-shard: הריצה עצמה
  -- נמשכת ~30 שניות, וה-timeout של הקריאה הוא 150 שניות.
  minutes constant int[] := array[2, 10, 18, 26, 34, 42];
  i int;
begin
  for i in 0 .. shard_count - 1 loop
    begin perform cron.unschedule('agendax-scan-shard-' || i); exception when others then null; end;
    perform cron.schedule(
      'agendax-scan-shard-' || i,
      format('%s * * * *', minutes[i + 1]),
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

-- ה-ranker: אחרי ה-shard האחרון (:42 + ~30 שניות), עם מרווח.
do $$ begin perform cron.unschedule('agendax-ingest-rank'); exception when others then null; end $$;

select cron.schedule(
  'agendax-ingest-rank',
  '50 * * * *',
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
