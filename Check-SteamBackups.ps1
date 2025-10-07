param(
    [Parameter(Mandatory = $true)] [string]$BackupDir,
    [Parameter(Mandatory = $true)] [string]$SteamCmdPath,
    [Parameter(Mandatory = $true)] [string]$RepoPath,
    [Parameter(Mandatory = $true)] [string]$GitUserName,
    [Parameter(Mandatory = $true)] [string]$GitUserEmail
)

# Detect environment (local or GitHub Actions)
$runSource = if ($env:GITHUB_ACTIONS -eq "true") { "GitHub Actions" } else { "Local Machine" }

# Safe date for logs and commits
$reportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Ensure paths
if (-not (Test-Path $BackupDir)) {
    Write-Host "❌ Backup directory not found: $BackupDir" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $SteamCmdPath)) {
    Write-Host "❌ SteamCMD not found: $SteamCmdPath" -ForegroundColor Red
    exit 1
}

$ReportFile = Join-Path $RepoPath "index.html"
$games = Get-ChildItem -Path $BackupDir -Filter "*.7z"
$total = $games.Count
if ($total -eq 0) {
    Write-Host "⚠️ No .7z files found in $BackupDir" -ForegroundColor Yellow
    exit
}

Write-Host "📦 Found $total game backups. Checking versions..." -ForegroundColor Cyan

$results = @()

foreach ($i in 0..($games.Count - 1)) {
    $file = $games[$i]
    $name = $file.BaseName
    if ($name -match "(.+?)_([0-9]+)_([0-9]+)") {
        $gameName = $matches[1]
        $appId = $matches[2]
        $installedBuildId = [int]$matches[3]

        Write-Host ("[{0}/{1}] Checking {2} (AppID={3}, Installed={4})..." -f ($i + 1), $total, $gameName, $appId, $installedBuildId)

        $tempFile = [System.IO.Path]::GetTempFileName()
        & "$SteamCmdPath" +login anonymous +app_info_update 1 +app_info_print $appId +quit > $tempFile 2>$null

        $fileContent = Get-Content $tempFile -Raw
        Remove-Item $tempFile -Force

        $latestBuildId = $null
        $latestDate = $null

        if ($fileContent -match '"buildid"\s+"(\d+)"') {
            $latestBuildId = [int]$matches[1]
        }
        if ($fileContent -match '"timeupdated"\s+"(\d+)"') {
            $unix = [int64]$matches[1]
            $epoch = [DateTimeOffset]::FromUnixTimeSeconds($unix)
            $latestDate = $epoch.ToString("yyyy-MM-dd")
        }

        if (-not $latestBuildId) {
            Write-Host "    → Could not fetch latest build" -ForegroundColor Yellow
            $status = "❓ Unknown"
            $color = "#ffffcc"
        } elseif ($installedBuildId -lt $latestBuildId) {
            $status = "⚠️ Update available"
            $color = "#ffdddd" # light red
        } else {
            $status = "✅ Up-to-date"
            $color = "#ddffdd" # light green
        }

        $results += [PSCustomObject]@{
            Name = $gameName
            AppID = $appId
            Installed = $installedBuildId
            Latest = $latestBuildId
            LatestDate = $latestDate
            Status = $status
            Color = $color
        }
    }
}

# ------------------------------
# Generate HTML report
# ------------------------------
$reportHtml = @"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Steam Backup Version Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #fafafa; color: #333; }
        h1 { text-align: center; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f0f0f0; }
        tr:hover { background-color: #f9f9f9; }
        .footer { margin-top: 20px; font-size: 0.9em; color: #666; text-align: right; }
    </style>
</head>
<body>
    <h1>Steam Backup Version Report</h1>
    <p class="footer">Generated on $reportDate via $runSource</p>
    <table>
        <tr>
            <th>Game</th><th>AppID</th><th>Installed Build</th><th>Latest Build</th><th>Latest Date</th><th>Status</th>
        </tr>
"@

foreach ($r in $results) {
    $reportHtml += "<tr style='background-color:${($r.Color)}'><td>$($r.Name)</td><td>$($r.AppID)</td><td>$($r.Installed)</td><td>$($r.Latest)</td><td>$($r.LatestDate)</td><td>$($r.Status)</td></tr>`n"
}

$reportHtml += @"
    </table>
    <p class="footer">Report generated on $reportDate ($runSource)</p>
</body>
</html>
"@

$reportHtml | Out-File -Encoding UTF8 -FilePath $ReportFile
Write-Host "✅ HTML report saved to: $ReportFile" -ForegroundColor Green

# ------------------------------
# Commit & Push to GitHub (safe force-with-lease)
# ------------------------------
Write-Host "📤 Committing and pushing report to GitHub..."
Set-Location $RepoPath
git config user.name $GitUserName
git config user.email $GitUserEmail

git add $(Split-Path $ReportFile -Leaf)
git commit -m "Update Steam backup report $reportDate ($runSource)" 2>$null

Write-Host "🔄 Pulling latest changes with rebase..."
git fetch origin
git rebase origin/main 2>$null

Write-Host "🚀 Pushing updated report..."
git push --force-with-lease origin main

Write-Host "✅ GitHub Pages updated! Check: https://$GitUserName.github.io/$(Split-Path $RepoPath -Leaf)/"
