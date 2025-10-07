param(
    [string]$BackupDir,
    [string]$SteamCmdPath,
    [string]$RepoPath,
    [string]$GitUserName,
    [string]$GitUserEmail
)

Write-Host "📦 Found installed backups in $BackupDir..." -ForegroundColor Cyan

# Detect if running in GitHub Actions
$IsGitHubActions = $env:GITHUB_ACTIONS -eq "true"

# HTML setup
$ReportPath = Join-Path $RepoPath "index.html"
$Html = @"
<html>
<head>
<title>Steam Backup Version Checker</title>
<style>
body { font-family: Segoe UI, sans-serif; background: #f4f4f4; color: #222; }
h1 { color: #333; }
table { border-collapse: collapse; width: 100%; background: white; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background-color: #333; color: white; }
tr:nth-child(even) { background-color: #f9f9f9; }
.status-ok { background-color: #e5f8e5; }
.status-update { background-color: #fdeaea; }
.footer { margin-top: 20px; font-size: 0.9em; color: #555; text-align: right; }
</style>
</head>
<body>
<h1>Steam Backup Version Checker</h1>
<p style="color:#777;">Generated on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</p>
<table>
<tr><th>Game</th><th>AppID</th><th>Latest BuildID</th><th>Installed BuildID</th><th>Latest Date</th><th>Status</th></tr>
"@

# --- GAME CHECK LOGIC (unchanged from your current version) ---
$BackupFiles = Get-ChildItem -Path $BackupDir -Filter "*.acf" -Recurse
foreach ($File in $BackupFiles) {
    $Content = Get-Content $File | Out-String
    if ($Content -match '"appid"\s+"(\d+)"' -and $Content -match '"buildid"\s+"(\d+)"' -and $Content -match '"name"\s+"([^"]+)"') {
        $AppId = $matches[1]
        $InstalledBuildId = $matches[2]
        $GameName = $matches[3]

        Write-Host "→ Checking $GameName (AppID=$AppId, Installed=$InstalledBuildId)..." -ForegroundColor Yellow

        $Json = & $SteamCmdPath +login anonymous +app_info_update 1 +app_info_print $AppId +quit | Out-String
        $LatestBuildId = ($Json -split '\n' | Select-String -Pattern '"buildid"' | Select-String -AllMatches).Matches.Value -replace '[^\d]', '' | Select-Object -Last 1
        $DateString = ($Json -split '\n' | Select-String -Pattern '"timeupdated"' | Select-String -AllMatches).Matches.Value -replace '[^\d]', '' | Select-Object -Last 1
        $LatestDate = if ($DateString) { 
            try { (Get-Date -UnixTimeSeconds [int64]$DateString -ErrorAction Stop).ToString("yyyy-MM-dd") } catch { "N/A" } 
        } else { "N/A" }

        if ($LatestBuildId -and [int]$LatestBuildId -gt [int]$InstalledBuildId) {
            $Status = "⚠️ Update available"
            $RowClass = "status-update"
        } else {
            $Status = "✅ Up to date"
            $RowClass = "status-ok"
        }

        $Html += "<tr class='$RowClass'><td>$GameName</td><td>$AppId</td><td>$LatestBuildId</td><td>$InstalledBuildId</td><td>$LatestDate</td><td>$Status</td></tr>`n"
    }
}

# Footer with context
$RunContext = if ($IsGitHubActions) { "🧩 Checked via GitHub Actions" } else { "💻 Checked locally" }
$Html += @"
</table>
<div class='footer'>
$RunContext<br>
Last updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
</div>
</body></html>
"@

# Write report
Set-Content -Path $ReportPath -Value $Html -Encoding UTF8

Write-Host "📄 Report generated at $ReportPath" -ForegroundColor Cyan

# GitHub upload only for local runs
if (-not $IsGitHubActions) {
    Write-Host "🔄 Pulling latest changes from remote..."
    git -C $RepoPath pull origin main --rebase

    Write-Host "📤 Committing and pushing..."
    git -C $RepoPath config user.name $GitUserName
    git -C $RepoPath config user.email $GitUserEmail
    git -C $RepoPath add index.html
    git -C $RepoPath commit -m "Update Steam backup report $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git -C $RepoPath push origin main
}
