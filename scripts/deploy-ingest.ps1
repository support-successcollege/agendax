# פריסת סוכן חדשות ההייטק העולמי.
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-ingest.ps1
#
# הסקריפט עוצר לפני כל פעולה שמשנה משהו.
#
# הקובץ שמור ב-UTF-8 עם BOM. זה הכרחי: Windows PowerShell 5.1 קורא קובץ .ps1
# בלי BOM לפי קוד-הדף של המערכת, ואז כל תו עברי הופך לג'יבריש ושובר את הפרסר.

$ErrorActionPreference = "Stop"

# כדי שהעברית תיראה נכון בקונסולה ולא כסימני שאלה.
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$projectRef = "kjazrljlfreczicstymr"
$sqlEditor  = "https://supabase.com/dashboard/project/$projectRef/sql/new"

function Write-Step { param($n, $text) Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-Ok   { param($text)     Write-Host "    $text" -ForegroundColor Green }
function Write-Warn { param($text)     Write-Host "    $text" -ForegroundColor Yellow }
function Write-Err  { param($text)     Write-Host "    $text" -ForegroundColor Red }

# פקודות חיצוניות לא זורקות חריגה ב-PowerShell, ולכן בודקים את קוד היציאה ידנית.
function Assert-LastExit {
    param($what)
    if ($LASTEXITCODE -ne 0) {
        Write-Err "$what נכשל (קוד יציאה $LASTEXITCODE). עצרתי כאן."
        exit 1
    }
}

# --- 0. Supabase CLI ---------------------------------------------------------
Write-Step 0 "בודק שה-Supabase CLI זמין"
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Err "Supabase CLI לא נמצא ב-PATH."
    Write-Err "התקנה:  scoop install supabase   או   npm install -g supabase"
    exit 1
}
$cliVersion = (supabase --version) -join " "
Write-Ok "Supabase CLI $cliVersion"

# --- 1. היסטוריית מיגרציות ---------------------------------------------------
# db push מריץ כל מיגרציה שחסרה בהיסטוריה המרוחקת. אם הסכמה נבנתה במקור דרך
# הדשבורד או Lovable, ההיסטוריה עלולה להיות ריקה, ואז db push ינסה להריץ שוב את
# 00000000000000_initial_schema ויתפוצץ על טבלאות שכבר קיימות.
Write-Step 1 "בודק את היסטוריית המיגרציות מול השרת"
supabase migration list

Write-Host ""
Write-Host "    הסתכל בטבלה למעלה:" -ForegroundColor White
Write-Host "      A - המיגרציות 00000000000000 עד 00000000000003 מופיעות גם ב-Local וגם ב-Remote"
Write-Host "      B - עמודת Remote ריקה או חלקית (db push יריץ מחדש מיגרציות ישנות ויכשל)"
Write-Host ""
$mode = Read-Host "    בחר A / B / Q ליציאה"
$mode = ("" + $mode).Trim().ToUpper()

if ($mode -eq "A") {
    Write-Step 2 "מריץ supabase db push"
    supabase db push
    Assert-LastExit "supabase db push"
    Write-Ok "המיגרציות הוחלו"
}
elseif ($mode -eq "B") {
    Write-Step 2 "הדבקה ידנית ב-SQL Editor, שני קבצים לפי הסדר"
    Write-Warn "שתי המיגרציות בטוחות להרצה חוזרת (create if not exists / add column if not exists)."

    $files = @(
        "supabase\migrations\00000000000004_global_tech_ingest.sql",
        "supabase\migrations\00000000000005_global_tech_ingest_cron.sql"
    )
    foreach ($f in $files) {
        if (-not (Test-Path $f)) {
            Write-Err "לא נמצא: $f"
            exit 1
        }
        Get-Content $f -Raw | Set-Clipboard
        Write-Host ""
        Write-Host "    $f  הועתק ללוח." -ForegroundColor White
        Start-Process $sqlEditor
        [void](Read-Host "    הדבק ב-SQL Editor, לחץ Run, וכשזה עבר לחץ Enter")
    }
    Write-Ok "המיגרציות הוחלו"
}
else {
    Write-Warn "בוטל."
    exit 0
}

# --- 3. Edge Functions -------------------------------------------------------
Write-Step 3 "פורס את שתי ה-Edge Functions"
supabase functions deploy ingest-global-tech ingest-worker
Assert-LastExit "supabase functions deploy"
Write-Ok "ingest-global-tech ו-ingest-worker נפרסו"

# --- 4. הסוד המשותף ----------------------------------------------------------
# מיגרציה 5 ייצרה סוד אקראי ב-Vault. אותו ערך חייב להגיע גם ל-Edge Functions,
# אחרת pg_cron יקבל 401 והסוכן לא ירוץ אף פעם.
Write-Step 4 "מסנכרן את הסוד בין pg_cron ל-Edge Functions"
$query = "select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret';"
$query | Set-Clipboard
Write-Warn "השאילתה הועתקה ללוח. הדבק ב-SQL Editor שנפתח, הרץ, והעתק את הערך שחוזר."
Start-Process $sqlEditor

Write-Host ""
$secret = Read-Host "    הדבק כאן את הערך"
$secret = ("" + $secret).Trim()
if ([string]::IsNullOrWhiteSpace($secret)) {
    Write-Err "לא הוזן ערך. הסוכן לא ירוץ אוטומטית עד שתריץ ידנית:"
    Write-Err "  supabase secrets set INGEST_CRON_SECRET=<הערך>"
    exit 1
}
supabase secrets set "INGEST_CRON_SECRET=$secret"
Assert-LastExit "supabase secrets set"
Write-Ok "INGEST_CRON_SECRET הוגדר"

# --- 5. סיום -----------------------------------------------------------------
Write-Host ""
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
Write-Host " הסוכן פרוס. עכשיו באדמין, בטאב 'סוכן חדשות עולמי':" -ForegroundColor Green
Write-Host ""
Write-Host "   1. 'בדוק מקורות'       - סריקה יבשה. מראה אילו פידים חיים ואילו"
Write-Host "                            מחזירים 403. כבה במתג כל מקור שנכשל."
Write-Host "   2. 'סרוק עכשיו'         - ממלא את התור ב-4 ידיעות מדורגות."
Write-Host "   3. 'כתוב את הבאה בתור'  - לחץ פעמיים. כתבה בכל לחיצה, כ-40 שניות."
Write-Host ""
Write-Host " שתי הטיוטות יחכו בטאב 'כתבות' תחת הפילטר 'טיוטות'." -ForegroundColor White
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
