<#
.SYNOPSIS
    Checks local Steam backup .7z files (NAME_APPID_BUILDID) and compares versions on Steam.
    Generates a clean HTML report with light color coding and auto-publishes to GitHub Pages.
#>

param(
    [string]$BackupDir,
    [string]$SteamCmdPath,
    [string]$ReportFile = "index.html",
    [string]$RepoPath = "",
    [string]$GitUserName = "",
    [string]$GitUserEmail = ""
)

# --- Detect environment (local vs GitHub Actions) ---
$IsGithubActions = $env:GITHUB_ACTIONS -eq "true"
$RunEnvironment = if ($IsGithubActions) { "GitHub Actions" } else { "Local Machine" }

# --- Setup ---
$ErrorActionPreference = "Stop"
$Games = Get-ChildItem -Path $BackupDir -Filter "*.7z" -File
if ($Games.Count -eq 0) {
    Write-Host "⚠️  No .7z files found in $BackupDir" -ForegroundColor Yellow
    exit
}

Write-Host "📦 Found $($Games.Count) game backups. Checking versions..." -ForegroundColor Cyan

# --- Helper: Run SteamCMD and parse latest build ---
function Get-LatestBuildInfo {
    param([string]$AppId, [string]$SteamCmdPath)

    try {
        $output = & "$SteamCmdPath" +login anonymous +app_info_update 1 +app_info_print $AppId +quit 2>&1
        $lines = $output -split "`n"

        # Find buildid and timeupdated
        $buildLine = $lines | Select-String -Pattern '"buildid"' | Select-Object -Last 1
        $timeLine  = $lines | Select-String -Pattern '"timeupdated"' | Select-Object -Last 1

        $buildId = if ($buildLine) { ($buildLine -split '"')[3] } else { "" }
        $timeUpdated = if ($timeLine) { [int64]($timeLine -split '"')[3] } else { 0 }

        $date = if ($timeUpdated -gt 0) {
            [DateTimeOffset]::FromUnixTimeSeconds($timeUpdated).DateTime.ToString("yyyy-MM-dd")
        } else { "N/A" }

        return [PSCustomObject]@{
            BuildId = $buildId
            Date    = $date
        }
    }
    catch {
        return [PSCustomObject]@{
            BuildId = ""
            Date    = "Error"
        }
    }
}

# --- Collect results ---
$Results = @()
$i = 0
foreach ($file in $Games) {
    $i++
    if ($file.BaseName -match '(.+?)_(\d+?)_(\d+?)$') {
        $name = $matches[1]
        $appId = $matches[2]
        $localBuild = $matches[3]

        Write-Host "[$i/$($Games.Count)] → Checking $name (AppID=$appId, Installed=$localBuild)..." -ForegroundColor Gray

        $latest = Get-LatestBuildInfo -AppId $appId -SteamCmdPath $SteamCmdPath

        if (-not $latest.BuildId) {
            $status = "⚠️ Failed to fetch"
            $class = "warn"
        }
        elseif ($latest.BuildId -eq $localBuild) {
            $status = "✅ Up to date"
            $class = "ok"
        }
        else {
            $status = "⚠️ Update available"
            $class = "update"
        }

        $Results += [PSCustomObject]@{
            Name = $name
            AppId = $appId
            Installed = $localBuild
            Latest = $latest.BuildId
            LatestDate = $latest.Date
            Status = $status
            Class = $class
        }
    }
}

# --- Generate HTML ---
$reportDate = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

$style = @"
<style>
body {
    font-family: 'Segoe UI', sans-serif;
    background: #fafafa;
    color: #333;
    margin: 40px;
}
table {
    border-collapse: collapse;
    width: 100%;
}
th, td {
    text-align: left;
    padding: 10px;
    border-bottom: 1px solid #ddd;
}
th {
    background: #e6e6e6;
}
tr.ok { background-color: #e9f7ef; }       /* light green */
tr.update { background-color: #fff3cd; }   /* light yellow */
tr.warn { background-color: #f8d7da; }     /* light red */
h1 {
    font-weight: 600;
}
.footer {
    margin-top: 20px;
    font-size: 0.9em;
    color: #666;
    text-align: right;
}
</style>
"@

$rows = $Results | ForEach-Object {
    "<tr class='$($_.Class)'><td>$($_.Name)</td><td>$($_.AppId)</td><td>$($_.Installed)</td><td>$($_.Latest)</td><td>$($_.LatestDate)</td><td>$($_.Status)</td></tr>"
} | Out-String

$html = @"
<html>
<head>
<meta charset='UTF-8'>
<title>Steam Backup Report</title>
$style
</head>
<body>
<h1>Steam Backup Report</h1>
<p>Report generated on: <b>$reportDate</b></p>
<table>
<tr><th>Game</th><th>AppID</th><th>Installed</th><th>Latest</th><th>Latest Date</th><th>Status</th></tr>
$rows
</table>
<div class="footer">
Generated from <b>$RunEnvironment</b>
</div>
</body>
</html>
"@

Set-Content -Path $ReportFile -Value $html -Encoding UTF8
Write-Host "✅ HTML report saved to: $ReportFile" -ForegroundColor Green

# --- GitHub auto push ---
if ($RepoPath -and $GitUserName -and $GitUserEmail) {
    Write-Host "📤 Committing and pushing report to GitHub..."
    Set-Location $RepoPath

    try {
        git config --global --add safe.directory $RepoPath
        git config user.name $GitUserName
        git config user.email $GitUserEmail

        git add $ReportFile
        git commit -m "Update Steam backup report $reportDate" || Write-Host "No changes to commit."
        git pull --rebase origin main
        git push origin main
        Write-Host "✅ GitHub Pages updated! Check: https://firebrawlx.github.io/SteamVersionChecker/"
    }
    catch {
        Write-Host "⚠️ GitHub push failed: $_" -ForegroundColor Yellow
    }
}
