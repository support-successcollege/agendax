# Playbook: הנדסה

אחראי: `agendax-engineer`. מקבל משימה מוגדרת מהמנכ"ל (אחרי שיניב אישר אותה),
כותב את הקוד בריפו, מאמת מקומית, ומחזיר diff + פקודות פריסה. **לא פורס, לא דוחף.**

## איפה מה

| שכבה | נתיב | אימות מקומי |
|---|---|---|
| Edge Functions | `supabase/functions/<name>/index.ts`, משותף ב-`_shared/` | `deno check supabase/functions/<name>/index.ts` (אם deno מותקן), אחרת קריאה זהירה |
| מיגרציות | `supabase/migrations/000000000000NN_<slug>.sql` - המספר הבא אחרי הגבוה שקיים | `ls supabase/migrations \| tail -1` |
| פרונט | `src/` (TanStack Start + Tailwind + shadcn) | `bun run typecheck` |
| סקריפטי build | `scripts/` | `bun run build` (איטי; רק כשנגעו ב-prerender) |
| ידע הסוכנים | `.claude/skills/agendax-ceo/`, `.claude/agents/` | קריאה |

## כללים

1. **קרא לפני שאתה כותב.** פונקציה קיימת ב-`_shared/` עדיפה על חדשה. הדפוסים:
   `callModelWithFallback` לכל קריאת מודל, `jsonResponse`/`requireIngestSecret`
   לאימות, `mdToArticleHtml` להמרת תוכן.
2. **מיגרציה = קובץ בריפו + הרצה.** הקובץ נכתב תמיד; ההרצה (`apply_migration`)
   🔴 ורק המנכ"ל מריץ אחרי אישור. מיגרציה שמשנה cron משתמשת ב-`cron.unschedule` ואז
   `cron.schedule` עם אותו שם.
3. **אין תלות חדשה** ב-`package.json` בלי לציין את זה במפורש בדוח.
4. **אין נגיעה** ב-`.env`, בסודות, ב-`authors`, ב-`social_accounts.credentials`.
5. **פרומפטים בעברית** של הסוכנים הכותבים יושבים בקוד הפונקציות. שינוי פרומפט =
   שינוי התוצר של כל כתבה מכאן והלאה - לתאר בדוח מה השתנה ולמה, ולהציע בדיקה על
   כתבה אחת (`{"max":1}`) לפני שהכרון ממשיך.
6. **קידוד:** קבצי `.ps1` בעברית נשמרים UTF-8 עם BOM (PowerShell 5.1). כל השאר UTF-8 בלי BOM.

## פריסה (🔴 - המנכ"ל בלבד, אחרי אישור)

```powershell
# Edge Function אחת
supabase functions deploy <name> --project-ref kjazrljlfreczicstymr

# או דרך MCP: mcp__supabase__deploy_edge_function עם תוכן הקבצים

# מיגרציה: mcp__supabase__apply_migration עם name + query (התוכן של הקובץ)

# פרונט: git push → Vercel בונה. גם ה-cron agendax-site-rebuild מריץ build כל 4 שעות.
```

אחרי פריסה: אימות על יחידה אחת (כתבה אחת, פריט תור אחד) לפני שנותנים ל-cron להמשיך.
גרסה נפרסה ואומתה = שורה ב-`manager_runs.actions_taken` עם `{"action":"deploy","target":"<name> vN"}`.

## פורמט הדוח של המהנדס

```
## הנדסה - <שם המשימה>
### מה שונה
- `path/to/file` - <משפט>
### אימות
- typecheck: עבר / נכשל (<שורה ראשונה של השגיאה>)
- deno check: עבר / לא רץ (<למה>)
### לפריסה (🔴)
1. `<פקודה מדויקת>`
2. ...
### סיכונים
- <מה יכול להישבר ואיך רואים את זה>
```
