# מפת המערכת - Agendax

פרויקט Supabase: `kjazrljlfreczicstymr` · אתר: Vercel (`prj_GlLbmD5Jcm5IBIhXysVaP6SPi3Gx`) ·
ריפו: `C:\Claude\yam\רימיקס אתר` → `github.com/support-successcollege/agendax` (branch `master`).
עודכן: 09/09/2026.

## כלי הגישה מ-Claude Code

| כלי | מה | צבע |
|---|---|---|
| `mcp__supabase__execute_sql` | כל SQL. הדרך הראשית לכל דבר | 🟢 ל-SELECT, לפי השער לכתיבה |
| `mcp__supabase__query_logs` (service `edge-function` / `postgres`) | לוגים כשיש חשד לכשל | 🟢 |
| `mcp__supabase__get_advisors` (`security` / `performance`) | ממצאי אבטחה וביצועים | 🟢 (התיקון 🔴) |
| `mcp__supabase__get_edge_function` / `list_edge_functions` | קוד הפונקציה הפרוסה | 🟢 |
| `mcp__supabase__deploy_edge_function` / `supabase functions deploy` | פריסה | 🔴 |
| `mcp__supabase__apply_migration` | DDL | 🔴 |
| `bun run typecheck` / `bun run build` | אימות קוד מקומי | 🟢 |
| `git push` | מעלה ל-GitHub ומפעיל build ב-Vercel | 🔴 |

אם שם השרת בסשן הוא `supabase-agendax` (הגדרת משתמש) במקום `supabase` (הגדרת
פרויקט ב-`.mcp.json`) - אותם כלים, קידומת אחרת: `mcp__supabase-agendax__execute_sql`.

## איך קוראים ל-Edge Function

**תמיד מתוך ה-DB**, לא ב-curl. הסיבה: הסוד `ingest_cron_secret` יושב ב-Vault ולא
צריך לעבור דרך הצ'אט או הטרמינל.

```sql
select net.http_post(
  url := 'https://kjazrljlfreczicstymr.supabase.co/functions/v1/<שם>',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret')
  ),
  body := '<json>'::jsonb,
  timeout_milliseconds := 150000
);
```

`net.http_post` הוא **אסינכרוני** - מחזיר `request_id` מיד. התוצאה כמה שניות אחר כך:

```sql
select status_code, left(content, 500) from net._http_response where id = <request_id>;
```

## Edge Functions

| פונקציה | מי מפעיל | גוף הבקשה | הרשאה |
|---|---|---|---|
| `ingest-scan-shard` | cron, 6 shards כל שעה (דקות 2,10,18,26,34,42) | `{"shard":N,"shards":6}` - סורק שישית מהמקורות אל `ingest_scan_buffer` | `x-ingest-secret` |
| `ingest-global-tech` | cron, כל שעה (דקה 50) | `{}` = דירוג הבאפר, דדופ, מילוי התור ליעד היומי | `x-ingest-secret` |
| `ingest-worker` | cron, כל 5 דק' | `{"max":1}` = כותב כתבה אחת מהתור (`ingest_items.status='pending'`) | `x-ingest-secret` |
| `article-image` | cron, כל 5 דק' | `{"articleId":"...","force":false}` = כתבה אחת · `{"sweep":true}` = כל מי שחסר לו תמונה | `x-ingest-secret` |
| `social-publish` | cron, כל 5 דק' | `{"auto":true}` = מילוי תור + פרסום מה שהגיע זמנו · `{"queueId":"..."}` = פריט אחד עכשיו · `{"articleId":"...","platforms":["facebook"],"kind":"post"}` = מיידי (`kind` גם `story`, `force:true` עוקף כפילות) | `x-ingest-secret` |
| `social-image` | cron, `5,35 * * * *` | `{"articleId":"...","variant":"post"}` (או `story`) | `x-ingest-secret` |
| `editors-picks` | cron 05:40 ישראל | `{}` = בחירת היום (לא עושה כלום אם קיימת) · `{"force":true}` = בונה מחדש · `{"date":"YYYY-MM-DD"}` | `x-ingest-secret` |
| `send-newsletter` | ידני | `{"intro":"...","category":"...","articleIds":[...],"testEmail":"..."}` | `x-ingest-secret` |
| `morning-brief` | cron 03:40 + retry 08:10 UTC | `{"date":"YYYY-MM-DD"}` | `x-ingest-secret` |
| `team-digest` | cron 04:30 UTC | `{"to":["mail@..."],"date":"..."}` | `x-ingest-secret` |
| `industry-events` | cron 03:20 + retry 08:05 UTC | `{}` | `x-ingest-secret` |
| `submit-sitemap` | cron 04:10 UTC | `{}` | `x-ingest-secret` |
| `index-article` | טריגר על פרסום | `{"articleId":"..."}` | `x-ingest-secret` |
| `marketing-article` | ידני | `{"url":"https://..."}` | `x-ingest-secret` |
| `rewrite-article` | ידני / אדמין | `{"articleId":"..."}` | `x-ingest-secret` |
| `generate-article` | **פאנל האדמין בלבד** | `{"topic":"...","sourceUrls":[...]}` | **JWT של אדמין** - לא מהסוכן |
| `verify-article`, `generate-social-post`, `generate-whatsapp-post`, `analyze-site` | פאנל האדמין | — | JWT |
| `ssr-article`, `ssr-home`, `sitemap`, `news-sitemap`, `og-meta` | הדפדפן / גוגל | — | ציבורי |
| `paypal-*`, `admin-create-student`, `newsletter-unsubscribe`, `send-admin-notification` | אתר / אדמין | — | לפי הפונקציה |

בריפו יש גם `ingest-plus-draft` שאינו פרוס. לא להפעיל בלי לבדוק למה.

## Cron jobs (הכל ב-UTC; ישראל = UTC+3 בקיץ)

| שם | תזמון | מה |
|---|---|---|
| `agendax-scan-shard-0` … `-5` | `2,10,18,26,34,42 * * * *` (אחד לכל shard) | 6 shards סורקים ~900 מקורות כל שעה אל `ingest_scan_buffer`, מפוזרים כדי לא להיחסם (403) |
| `agendax-ingest-rank` | `50 * * * *` | `ingest-global-tech`: דירוג הבאפר והכנסה לתור |
| `agendax-ingest-worker` | `*/5 * * * *` | כותב כתבה אחת לכל הרצה |
| `agendax-publish-scheduled` | `*/5 * * * *` | `is_draft=false` לכל מה ש-`scheduled_at <= now()` **ויש לו תמונה משלו** |
| `agendax-article-image` | `*/5 * * * *` | `{"sweep":true}` - תמונה לכתבה אחת שחסרה לה |
| `agendax-social-publish` | `*/5 * * * *` | ממלא את התור ומפרסם |
| `agendax-social-prerender` | `5,35 * * * *` | תמונות פוסט/סטורי מראש לכתבות שעולות ב-95 הדקות הקרובות |
| `agendax-editors-picks` | `40 2 * * *` (05:40 ישראל) | בחירת העורכים של היום |
| `agendax-site-rebuild` | `0 3,7,11,15,19,23 * * *` | deploy hook ב-Vercel |
| `agendax-sitemap-submit` | `10 4 * * *` | הגשת sitemap לגוגל |
| `agendax-hero-rotation` | `0 1 * * 0` (ראשון) | `refresh_hero_rotation()` |
| `agendax-team-digest` | `30 4 * * *` | מייל סיכום לצוות |
| `agendax-industry-events` (+retry `5 8`) | `20 3 * * *` | איסוף אירועי תעשייה |
| `agendax-morning-brief` (+retry `10 8`) | `40 3 * * *` | בריף בוקר |

**ה-retry ב-08:xx UTC קיים בגלל Gemini:** המכסה החינמית מתאפסת ב-10:00 ישראל.

## שרשרת המודלים

כל קריאה שמייצרת כתבה עוברת ב-`callModelWithFallback` (`_shared/ingest.ts`):
Gemini flash → flash-lite → … → **Claude** (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`,
`AI_PRIMARY=claude` הופך את הסדר). תמונות: `GEMINI_IMAGE_MODEL` →
`gemini-3-pro-image` → `gemini-2.5-flash-image` → `gemini-2.0-flash-preview-image-generation`.

## שער התמונה

`agendax-publish-scheduled` מדלג על כתבה שה-`image_url` שלה ריק או שהוא תמונת
המלאי הגנרית (`photo-1504711434969-e33886168f5c`). היא שומרת על ה-`scheduled_at`
בעבר, `agendax-article-image` מייצר לה תמונה, והטיק הבא מפרסם אותה. Q19 מראה
מי תקוע.

## בחירת העורכים

`editors-picks` רץ כל בוקר, בוחר 6 כתבות (4 טריות + 2 ותיקות), חוסם חזרה של 10
ימים, מגביל ל-2 לקטגוריה, וכותב נימוק של 6-12 מילים. נפילה דטרמיניסטית אם המודל
נכשל. `src/components/news/EditorsPicks.tsx` מציג את היום האחרון **שקיים בטבלה**.

## חדר החדשות (authors)

מאז מיגרציות 34-35 לכל כתבה יש `author_slug` שמצביע על `authors` - סוכני כתיבה
עם שם ישראלי, `kind='agent'`, תחום (`beat`), וקטגוריות. הביילן באתר אומר במפורש
שזה סוכן. **לא לשנות** `authors` בלי אישור - זה משפיע על כל הכתבות.

## טבלאות מרכזיות

**`articles`** - `id, title, excerpt, content, category, category_slug, date, image_url, author, author_slug, is_breaking, is_featured, is_draft, scheduled_at, published_at, slug, source_url, source_name, source_published_at, source_links, review_score, review_note, content_updated_at, created_at, updated_at`
- `review_score <= 6` משאיר טיוטה **בלי** `scheduled_at` בכוונה - שער איכות, לא באג.
- `content_updated_at` מזין את `dateModified`; לעדכן רק כשהתוכן באמת השתנה.

**`social_queue`** - `article_id, platforms[], kind('post'|'story'), scheduled_at, status('queued'|'publishing'|'posted'|'failed'|'cancelled'), source('auto'|'manual'), result, error, posted_at`
⚠️ הסטטוס הוא `queued`, לא `pending`.

**`social_posts`** - יומן לכל פלטפורמה: `article_id, platform, status, external_id, post_text, error`. סטורי = `facebook_story` / `instagram_story`.
**`social_settings`** (id=1) - `posts_per_day`, `publish_hours[]` (ישראל), `auto_fill`, `auto_stories`
**`social_accounts`** - `platform, enabled, auto_publish, credentials`

**`ingest_config`** (שורה אחת) - `daily_target`, `weekend_target`, `queue_buffer`, `lookback_hours`
**`ingest_scan_buffer`** - מה שה-shards אספו בשעה האחרונה, לפני דירוג
**`ingest_items`** - יומן דדופ קבוע לפי `url_key`; `status`, `attempts`
**`ingest_runs`** - `kind, trigger, sources_ok, sources_failed, items_seen, items_new, items_queued, articles_created, notes, duration_ms`
**`news_sources`** (~900 פעילים) - `name, feed_url, bucket, weight, is_active, last_fetched_at, last_status, last_item_count, first_failed_at, auto_disabled_at`

**`editors_picks`** - `pick_date, article_id, rank, note`
**`hero_rotation`** - `article_id, rank, picked_at` (שבועי)
**`page_views`** - `article_id, viewed_at, path, referrer, visitor_id, ip_hash`
**`newsletter_subscribers`**, **`newsletter_sends`**, **`daily_briefs`**, **`industry_events`**, **`funding_deals`**, **`site_settings`** (`show_jobs`, `show_courses`, `social_links`)

**`manager_runs`** - יומן המנכ"ל: `kind('daily'|'overview'|'adhoc'|'scheduled'), ran_at, summary jsonb, report_md, proposals jsonb, actions_taken jsonb, status('reported'|'approved'|'rejected'), approved_note`

## פונקציות SQL

`ingest_daily_stats()` · `ingest_category_stats()` · `get_hot_articles(p_hours, p_limit)` ·
`next_publish_slot(_step_minutes)` · `refresh_hero_rotation()` 🔴 · `set_featured_article(_article_id)` 🔴

## איך מתמלא התור החברתי (`social-publish` עם `auto:true`)

סלוטים = `publish_hours` הראשונים עד `posts_per_day`, להיום ולמחר. סלוט פנוי אם
ביום יש פחות מהמכסה ואין פריט בטווח 20 דקות. מועמדים: פורסמו ב-3 הימים האחרונים,
לא `marketing`, מעולם לא היו בתור (חוץ מ-`cancelled`) ולא פורסמו. מיון: `is_breaking`
ואז `published_at` יורד.

## הקוד

```
src/                      TanStack Start, prerender סטטי. bun run dev / build / typecheck
src/components/news/      רכיבי עמוד הבית (EditorsPicks, Sidebar, ...)
supabase/functions/       Edge Functions (Deno). _shared/ = ingest.ts, social.ts, postImage.ts
supabase/migrations/      00000000000001 … 00000000000035. הבא: 36
scripts/                  collect-pages.ts, postbuild.ts, deploy-ingest.ps1
skills/agendax-manager/   הגרסה הישנה ל-Cowork. לא למחוק, לא לערוך - הוחלפה ב-.claude/skills/agendax-ceo
```
