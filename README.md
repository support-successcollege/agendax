# Agendax

אתר תוכן בעברית (RTL) על הייטק, בינה מלאכותית, כספים וחברות — עם מחולל כתבות AI, אזור קורסים, לוח דרושים ומערכת חלוניות פרסום.

האתר **סטטי לחלוטין**: GitHub Pages מגיש HTML שנבנה מראש, וכל פעולה שדורשת סוד רצה
ב-Supabase Edge Function. אין שרת בזמן ריצה.

```
GitHub Pages (סטטי)                Supabase
├─ HTML מוכן לכל כתבה/קורס/משרה    ├─ Postgres + RLS
├─ באנדל JS שמתלבש על ה-HTML       ├─ Auth
├─ 404.html = fallback ל-SPA       ├─ Storage (article-images)
├─ sitemap.xml + news-sitemap.xml   └─ Edge Functions (AI, PayPal, מיילים, ניהול)
└─ CNAME → agendax.co.il
```

## דרישות

- **Bun** (הרצה, התקנה ובנייה)
- **Node 22+** אם מריצים דרך node. הסקריפטים כאן מריצים את vite דרך `bunx --bun`
  כי rolldown (Vite 8) נופל על Node 20 עם `ERR_INVALID_ARG_VALUE` ב-`util.styleText`.
- Supabase CLI — רק כדי לפרוס Edge Functions ולנהל סכמה.

## הרצה מקומית

```bash
cp .env.example .env && bun install && bun run dev
```

`http://localhost:5173`. האתר קורא מ-Supabase המרוחק עם המפתח הציבורי.

בדיקה של הפלט הסטטי בדיוק כפי ש-GitHub Pages יגיש אותו:

```bash
bun run build && bun run preview
```

`http://localhost:4173`. `serve` מגיש `404.html` לכל נתיב שאין לו קובץ — בדיוק
כמו Pages — כך שאפשר לוודא שנתיבים כמו `/admin` עדיין נטענים.

## בנייה

`bun run build` עושה שלושה דברים:

1. `scripts/collect-pages.ts` שואל את Supabase אילו כתבות, קורסים, אירועים ומשרות
   קיימים, ומחזיר את רשימת הנתיבים.
2. Vite + TanStack Start מרנדרים כל נתיב כזה ל-HTML אמיתי (`autoSubfolderIndex`,
   כלומר `/article/foo` → `article/foo/index.html`), ומייצרים `sitemap.xml`.
3. `scripts/postbuild.ts` מעתיק `index.html` ל-`404.html` וכותב `news-sitemap.xml`.

נתיבי אדמין והתחברות (`/admin`, `/auth`, `/reset-password`, `/courses/account`)
מוחרגים מה-prerender בכוונה ורצים רק כ-SPA.

## פריסה

`.github/workflows/deploy.yml` בונה ומעלה ל-GitHub Pages בכל push ל-`main`,
כל 30 דקות, וגם ב-`repository_dispatch` מסוג `content-updated` — כדי שכתבה חדשה
תקבל HTML מוכן לזחלנים בלי לחכות ל-push.

משתנים נדרשים ב-Settings → Secrets and variables → Actions → **Variables**:

| שם | ערך |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `VITE_SUPABASE_PROJECT_ID` | מזהה הפרויקט |
| `SITE_URL` | `https://agendax.co.il` |
| `BASE_PATH` | `/` לדומיין מותאם, `/<repo>/` לאתר `github.io` |

כל אלה ציבוריים — RLS הוא מה שמגן על הנתונים.

## Edge Functions

כל פעולה שדורשת סוד. הקוד ב-`supabase/functions/`, הקריאה מהדפדפן דרך
`src/lib/edge.ts`.

| קובץ בצד לקוח | Edge Function | סוד שנדרש |
|---|---|---|
| `ai.functions.ts` | `generate-article`, `verify-article`, `generate-social-post`, `generate-whatsapp-post`, `analyze-site` | `GEMINI_API_KEY` (חינמי מ-aistudio.google.com) |
| `admin.functions.ts` | `admin-create-student`, `submit-sitemap`, `send-admin-notification` | service role, Google service account, `RESEND_API_KEY` |
| `paypal.functions.ts` | `paypal-config`, `paypal-create-order`, `paypal-capture-order` | `PAYPAL_CLIENT_SECRET` |
| `ai.functions.ts` (טאב הסוכן) | `ingest-global-tech`, `ingest-worker` | `GEMINI_API_KEY`, `INGEST_CRON_SECRET`, service role |

פריסה והגדרת סודות:

```bash
supabase functions deploy
supabase secrets set PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... RESEND_API_KEY=...
```

### מיילים

`send-admin-notification` שולח דרך [Resend](https://resend.com). שלושה משתנים:

| משתנה | ברירת מחדל | הערה |
|---|---|---|
| `RESEND_API_KEY` | — | חובה |
| `MAIL_FROM` | `Agendax <notifications@agendax.co.il>` | **חייב** להיות על דומיין מאומת ב-Resend |
| `ADMIN_EMAIL` | `info@agendax.co.il` | יעד ההתראות |

כדי שהמיילים לא ייפלו לספאם צריך לאמת את `agendax.co.il` ב-Resend ולהוסיף את
רשומות ה-SPF וה-DKIM שהוא נותן. עד שזה קורה אפשר לבדוק עם
`MAIL_FROM="Agendax <onboarding@resend.dev>"`.

`reply_to` נקבע אוטומטית לכתובת של מי שהגיש (מגיב, נרשם לניוזלטר, ממלא טופס),
כך שלחיצה על "השב" פונה אליו ולא לכתובת השולח.

## סוכן חדשות ההייטק העולמי

סורק את אתרי הטכנולוגיה הגדולים בעולם, בוחר את הידיעות החשובות, כותב אותן **מחדש
בעברית** ושומר אותן כטיוטה. שום דבר לא מתפרסם בלי אישור אנושי.

הסוכן מפוצל לשתי Edge Functions בכוונה. ל-Edge Function יש מגבלת זמן ריצה, וכתיבת
כתבה אחת (משיכת המקור + שתי קריאות מודל + הפקת תמונה) לוקחת עשרות שניות. לכן:

| פונקציה | תפקיד | תזמון |
|---|---|---|
| `ingest-global-tech` | מושכת את כל הפידים, מנקה כפילויות, מדרגת ובוחרת 4 ידיעות, ומכניסה אותן לתור | `0 3,10,17 * * *` (UTC) |
| `ingest-worker` | לוקחת ידיעה אחת מהתור, כותבת כתבה בעברית, מפיקה תמונה ושומרת טיוטה | `*/5 * * * *` |

שעות ה-UTC הן 06:00 / 13:00 / 20:00 שעון ישראל בקיץ, ושעה אחת מוקדם יותר בחורף.

### הצינור

```
news_sources (17 פידים)
   ↓  RSS/Atom, במקביל, עם timeout לכל מקור
ingest_items — כל URL שנראה אי פעם, עם url_key מנורמל
   ↓  dedupe: url_key קיים = דילוג, לתמיד
דירוג ע"י Gemini — 4 ידיעות, לפי חשיבות ורלוונטיות לקורא הישראלי
   ↓  status = 'pending'
ingest-worker: קריאת המקור במלואו → כתיבה מחדש בעברית → תמונה
   ↓
articles (is_draft = true) + source_url / source_name / source_published_at
```

`url_key` הוא הכתובת בלי סכימה, בלי `www.` ובלי פרמטרי מעקב. שתי כתובות שמצביעות
על אותה כתבה מתמזגות לשורה אחת, ולכן ידיעה לא נשקלת ולא נכתבת פעמיים — לא משנה כמה
פידים נושאים אותה או כמה פעמים ה-cron רץ.

### מה הסוכן לא עושה

- **לא מתרגם.** הפרומפט דורש כתבה מקורית בעברית, ניסוח ומבנה עצמאיים, עם ייחוס
  לדיווח המקורי בגוף הטקסט וקישור חוזר בסוף. זה גם מה שמונע בעיית זכויות יוצרים
  וגם מה ש-Google News מצפה לראות.
- **לא ממציא.** אם המקור לא נקרא (paywall, חסימה) או שהמודל מדווח `confidence <= 3`,
  הפריט נכשל ולא נכתבת כתבה חלקית.
- **לא מפרסם.** כל כתבה נשמרת `is_draft = true` וממתינה לאישור בטאב "כתבות".

### הפעלה

מהאדמין: טאב **"סוכן חדשות עולמי"** — "בדוק מקורות" (סריקה יבשה, לא כותבת כלום),
"סרוק עכשיו", "כתוב את הבאה בתור". שם גם התור, יומן הריצות והמתג להפעלה/כיבוי של
כל מקור.

### התקנה

```bash
supabase db push
supabase functions deploy ingest-global-tech ingest-worker
```

המיגרציה `00000000000005` מייצרת סוד אקראי ב-Supabase Vault. יש להעביר אותו גם
ל-Edge Functions, אחרת ה-cron יקבל 401:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret';
```

```bash
supabase secrets set INGEST_CRON_SECRET=<הערך מהשאילתה>
```

`GEMINI_API_KEY` כבר מוגדר עבור `generate-article` ומשמש גם כאן.

### כוונון

| מה | איפה |
|---|---|
| כמה כתבות בסריקה | `body.limit` ב-cron job `agendax-ingest-scan` (ברירת מחדל 4) |
| אילו מקורות פעילים | מתג בטאב האדמין, או `news_sources.is_active` |
| כמה מקור נחשב אמין | `news_sources.weight` (1-10) — משפיע על הדירוג ועל מי מנצח בכפילות |
| חלון הזמן לאחור | `body.lookbackHours` (ברירת מחדל 24) |
| אורך ומבנה הכתבה | `WRITER_SYSTEM` ב-`supabase/functions/ingest-worker/index.ts` |
| קריטריוני הבחירה | `rankerSystem` ב-`supabase/functions/ingest-global-tech/index.ts` |

## מה נשאר תלוי ב-Lovable

- `AIArticlePlusBridge` פותח חלון אל `news-creator-plus.lovable.app` — הקשר האחרון שנותר.

*(מיילים עברו ל-Resend; פונקציות ה-AI עברו ל-Gemini API ישיר עם `GEMINI_API_KEY`.)*

## מגבלות של GitHub Pages שצריך להכיר

- אין הפניות 301 בצד שרת. ההפניה מ-`/article/<uuid>` ל-slug רצה עכשיו בצד לקוח.
- כתבה חדשה מקבלת HTML רק אחרי בנייה. עד אז הזחלן מקבל `404.html` (סטטוס 404),
  ולכן חשוב שה-`repository_dispatch` יופעל בזמן פרסום.
- אין שליטה בכותרות HTTP (CSP, cache-control).
