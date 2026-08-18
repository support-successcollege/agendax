# העלאת סוכן חדשות ההייטק ל-GitHub, מה שמפעיל בנייה ופריסה של האתר.
#
#   powershell -ExecutionPolicy Bypass -File scripts\push-ingest.ps1
#
# הסקריפט מריץ typecheck לפני הכל. אם הטיפוסים לא עוברים, הבנייה ב-GitHub
# Actions תיפול בדיוק באותו מקום, ועדיף לגלות את זה כאן מאשר שם.

$ErrorActionPreference = "Stop"

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step { param($n, $text) Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-Ok   { param($text)     Write-Host "    $text" -ForegroundColor Green }
function Write-Warn { param($text)     Write-Host "    $text" -ForegroundColor Yellow }
function Write-Err  { param($text)     Write-Host "    $text" -ForegroundColor Red }

function Assert-LastExit {
    param($what)
    if ($LASTEXITCODE -ne 0) {
        Write-Err "$what נכשל (קוד יציאה $LASTEXITCODE). עצרתי כאן."
        exit 1
    }
}

# --- 0. סביבה ----------------------------------------------------------------
Write-Step 0 "בודק שהכלים זמינים"
foreach ($tool in @("git", "bun")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Err "$tool לא נמצא ב-PATH."
        exit 1
    }
}
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Assert-LastExit "git rev-parse"
$remote = (git remote get-url origin).Trim()
Write-Ok "ענף: $branch"
Write-Ok "remote: $remote"

if ($branch -ne "main") {
    Write-Warn "אתה לא על main. ה-workflow של הפריסה מגיב רק ל-push ל-main."
    $go = Read-Host "    להמשיך בכל זאת? (y/N)"
    if (("" + $go).Trim().ToLower() -ne "y") { Write-Warn "בוטל."; exit 0 }
}

# --- 1. typecheck ------------------------------------------------------------
# זה השלב שמונע בנייה אדומה ב-Actions. הוא לא בונה, רק מוודא טיפוסים, כמה שניות.
Write-Step 1 "מריץ bun run typecheck"
bun run typecheck
Assert-LastExit "typecheck"
Write-Ok "הטיפוסים תקינים"

# --- 2. staging --------------------------------------------------------------
# מוסיפים רק את הקבצים של הסוכן ולא git add . , כדי ששום דבר אחר שפתוח אצלך
# בעבודה לא ייסחף לתוך הקומיט הזה.
Write-Step 2 "מוסיף את קבצי הסוכן"
$files = @(
    "supabase\migrations\00000000000004_global_tech_ingest.sql",
    "supabase\migrations\00000000000005_global_tech_ingest_cron.sql",
    "supabase\migrations\00000000000006_ingest_daily_quota.sql",
    "supabase\functions\_shared\ingest.ts",
    "supabase\functions\ingest-global-tech\index.ts",
    "supabase\functions\ingest-worker\index.ts",
    "supabase\config.toml",
    "src\lib\ai.functions.ts",
    "src\components\AdminGlobalIngestTab.tsx",
    "src\hooks\useGlobalIngest.ts",
    "src\integrations\supabase\types.ts",
    "src\pages\Admin.tsx",
    "scripts\deploy-ingest.ps1",
    "scripts\push-ingest.ps1",
    "README.md"
)
foreach ($f in $files) {
    if (-not (Test-Path $f)) { Write-Err "לא נמצא: $f"; exit 1 }
    git add -- $f
    Assert-LastExit "git add $f"
}

Write-Host ""
git status --short -- $files
Write-Host ""
Write-Warn "אלה הקבצים שייכנסו לקומיט. .env מוחרג ב-gitignore ולא ייכלל."
$go = Read-Host "    לבצע commit ו-push? (y/N)"
if (("" + $go).Trim().ToLower() -ne "y") {
    Write-Warn "בוטל. הקבצים נשארו ב-staging, אפשר לבטל עם: git reset"
    exit 0
}

# --- 3. commit ---------------------------------------------------------------
Write-Step 3 "יוצר commit"
$msg = @"
feat: global hi-tech news ingest agent

Scans the major world tech feeds, ranks the stories for an Israeli
tech audience, rewrites them as original Hebrew articles and saves
them as drafts for editorial approval.

Split into two Edge Functions on purpose: ingest-global-tech scans,
dedupes and enqueues in seconds, while ingest-worker writes one
article per invocation. A single function doing all four articles
would exceed the Edge Function wall-clock limit.

Dedupe is permanent and URL based - ingest_items.url_key is unique,
so a story is never ranked or written twice no matter how many feeds
carry it or how often cron runs.

Nothing auto-publishes: every generated article is is_draft = true.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S7k8cKVMMZCG2dALhTJeoW
"@

git commit -m $msg
if ($LASTEXITCODE -ne 0) {
    Write-Warn "אין מה לקמט, כנראה הקבצים כבר בקומיט קודם. ממשיך ל-push."
}

# --- 4. push -----------------------------------------------------------------
Write-Step 4 "דוחף ל-$branch"
git push origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Err "ה-push נדחה. סביר שיש קומיטים בשרת שאין לך מקומית. נסה:"
    Write-Err "  git pull --rebase origin $branch"
    Write-Err "ואז הרץ את הסקריפט הזה שוב."
    exit 1
}
Write-Ok "נדחף"

# --- 5. קישורים --------------------------------------------------------------
# ממירים git@github.com:owner/repo.git או https://github.com/owner/repo.git
# לכתובת דפדפן, כדי שאפשר יהיה לפתוח את ההרצה ישירות.
$slug = $remote -replace "^git@github\.com:", "" -replace "^https://github\.com/", "" -replace "\.git$", ""

Write-Host ""
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
Write-Host " הקוד באוויר. הבנייה רצה עכשיו:" -ForegroundColor Green
Write-Host ""
Write-Host "   https://github.com/$slug/actions"
Write-Host ""
Write-Host " הבנייה לוקחת בערך 2-4 דקות (bun install + prerender של כל הכתבות)."
Write-Host " כשהיא ירוקה, הטאב 'סוכן חדשות עולמי' יופיע באדמין החי."
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

$open = Read-Host "    לפתוח את דף ההרצות בדפדפן? (Y/n)"
if (("" + $open).Trim().ToLower() -ne "n") {
    Start-Process "https://github.com/$slug/actions"
}
