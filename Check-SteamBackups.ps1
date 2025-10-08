<#
.SYNOPSIS
Checks local Steam backup versions and polls Steam for updates.
Supports both local execution and GitHub Actions polling.

.PARAMETER BackupDir
Folder where local .7z game backups are stored (ignored in GitHub Actions mode).

.PARAMETER SteamCmdPath
Path to steamcmd executable.

.PARAMETER RepoPath
Path to the repo containing report and JSON data.

.PARAMETER GitUserName
Git username for commit.

.PARAMETER GitUserEmail
Git email for commit.
#>

param (
    [Parameter(Mandatory=$false)]
    [string]$BackupDir = ".",

    [Parameter(Mandatory=$true)]
    [string]$SteamCmdPath,

    [Parameter(Mandatory=$true)]
    [string]$RepoPath,

    [Parameter(Mandatory=$true)]
    [string]$GitUserName,

    [Parameter(Mandatory=$true)]
    [string]$GitUserEmail
)

$IsGitHubActions = $env:GITHUB_ACTIONS -eq "true"
$ReportFile = Join-Path $RepoPath "index.html"
$DataFile   = Join-Path $RepoPath "games.json"

$GamesData = @{}
if (Test-Path $DataFile) {
    $GamesData = Get-Content $DataFile | ConvertFrom-Json
    Write-Host "Loaded GamesData:"
    $GamesData | ConvertTo-Json -Depth 5 | Write-Host
} else {
    Write-Host "No games.json found at $DataFile"
}

function Get-LocalBackups {
    param($BackupDir)
    $backups = @()
    if (Test-Path $BackupDir) {
        Get-ChildItem $BackupDir -Filter "*.7z" | ForEach-Object {
            $nameParts = $_.BaseName -split "_"
            if ($nameParts.Length -ge 3) {
                $backups += [PSCustomObject]@{
                    Name    = ($nameParts[0..($nameParts.Length-3)] -join "_")
                    AppID   = [int]$nameParts[-2]
                    BuildID = [int]$nameParts[-1]
                }
            }
        }
    }
    return $backups
}

if ($IsGitHubActions) {
    Write-Host "📡 Running in GitHub Actions mode. Scanning for updates..."
    $GamesToCheck = @()
    foreach ($property in $GamesData.PSObject.Properties) {
      $GamesToCheck += $property.Value
    }
} else {
    Write-Host "📦 Running locally. Scanning backups in $BackupDir ..."
    $GamesToCheck = Get-LocalBackups -BackupDir $BackupDir
    foreach ($g in $GamesToCheck) {
        if ($GamesData.ContainsKey($g.AppID)) {
            $GamesData[$g.AppID].Name = $g.Name
            $GamesData[$g.AppID].InstalledBuild = $g.BuildID
        } else {
            $GamesData[$g.AppID] = @{
                Name    = $g.Name
                AppID   = $g.AppID
                InstalledBuild = $g.BuildID
            }
        }
    }
    $GamesData | ConvertTo-Json -Depth 5 | Set-Content $DataFile
}

Write-Host "Number of games to process: $($GamesToCheck.Count)"

function Get-LatestBuild {
    param($AppID, $SteamCmdPath)
    $tempFile = New-TemporaryFile
    & $SteamCmdPath +login anonymous +app_info_update 1 +app_info_print $AppID +quit > $tempFile 2>&1
    $content = Get-Content $tempFile -Raw
    Remove-Item $tempFile -Force

    $buildid = $null
    $timeupdated = $null
    if ($content -match '"buildid"\s*"(\d+)"') {
        $buildid = [int]$matches[1]
    }
    if ($content -match '"timeupdated"\s*"(\d+)"') {
        $timeupdated = [int]$matches[1]
    }
    return @{
        BuildID = $buildid
        TimeUpdated = $timeupdated
    }
}

# --- SkidrowReloaded RSS feed search ---
function Get-SkidrowLinks {
  param($gameName, $sinceDate)
  $feedUrl = 'https://feeds.feedburner.com/SkidrowReloadedGames'
  $rss = Invoke-WebRequest -Uri $feedUrl -UseBasicParsing
  $xml = [xml]$rss.Content
  $items = $xml.rss.channel.item
  $links = @()
  $normalizedGameName = $gameName.ToLower().Replace('.', '').Replace(' ', '')
  foreach ($item in $items) {
    $title = $item.title
    $link = $item.link
    $guid = $item.guid
    $pubDate = Get-Date $item.pubDate
    $normalizedTitle = $title.ToLower().Replace('.', '').Replace(' ', '')
    if ($normalizedTitle.Contains($normalizedGameName) -and $pubDate -ge $sinceDate) {
      # Prefer guid if it's a valid SkidrowReloaded URL
      $guidUrl = $guid.InnerText
      if ($guidUrl -and $guidUrl.StartsWith('https://www.skidrowreloaded.com/')) {
        $links += $guidUrl
      } else {
        $links += $link
      }
    }
  }
  return $links
}
# --- End SkidrowReloaded RSS feed search ---

$Results = @()
foreach ($game in $GamesToCheck) {
    Write-Host "Processing game: $($game.Name) (AppID=$($game.AppID))"
    $latestInfo = Get-LatestBuild -AppID $game.AppID -SteamCmdPath $SteamCmdPath
    $latestBuild = $latestInfo.BuildID
    $latestTimeUpdated = $latestInfo.TimeUpdated

    $prevBuild = $GamesData[$game.AppID].LatestBuild
    $prevDate = $GamesData[$game.AppID].PSObject.Properties['LatestDate'] ? $GamesData[$game.AppID].LatestDate : $null

    # Use Steam's timeupdated if available
    if ($latestTimeUpdated) {
        $latestDate = (Get-Date -UnixTimeSeconds $latestTimeUpdated).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        if ($GamesData[$game.AppID].PSObject.Properties['LatestDate']) {
            $GamesData[$game.AppID].LatestDate = $latestDate
        } else {
            $GamesData[$game.AppID] | Add-Member -MemberType NoteProperty -Name LatestDate -Value $latestDate
        }
    } elseif (($latestBuild -ne $prevBuild) -or (-not $prevDate)) {
        $latestDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        if ($GamesData[$game.AppID].PSObject.Properties['LatestDate']) {
            $GamesData[$game.AppID].LatestDate = $latestDate
        } else {
            $GamesData[$game.AppID] | Add-Member -MemberType NoteProperty -Name LatestDate -Value $latestDate
        }
    } else {
        $latestDate = $prevDate
    }
    
    if ($GamesData[$game.AppID].PSObject.Properties['LatestBuild']) {
        $GamesData[$game.AppID].LatestBuild = $latestBuild
    } else {
        $GamesData[$game.AppID] | Add-Member -MemberType NoteProperty -Name LatestBuild -Value $latestBuild
    }

    $status = ""
    if ($latestBuild -eq $null) {
        $status = "❌ Could not fetch latest"
    } elseif ($latestBuild -gt $game.InstalledBuild) {
        $status = "⚠️ Update available"
    } else {
        $status = "✅ Up to date"
    }

    $Results += [PSCustomObject]@{
        Name          = $game.Name
        AppID         = $game.AppID
        InstalledBuild= $game.InstalledBuild
        LatestBuild   = $latestBuild
        LatestDate    = $latestDate
        Status        = $status
    }
}

$GamesData | ConvertTo-Json -Depth 5 | Set-Content $DataFile

$stockholmTZ = [System.TimeZoneInfo]::FindSystemTimeZoneById("Central European Standard Time")
$DateNow = [System.TimeZoneInfo]::ConvertTimeFromUtc((Get-Date).ToUniversalTime(), $stockholmTZ).ToString("yyyy-MM-dd HH:mm")
$RunMode = if ($IsGitHubActions) { "GitHub Actions" } else { "Local run" }

$HTML = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Steam Backup Report</title>
<style>
body { font-family: Arial, sans-serif; padding: 20px; }
h1 { color: #333; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
.status-up-to-date { background-color: #c6efce; }
.status-update { background-color: #ffc7ce; }
.subtle { color: #666; font-size: 0.9em; }
th { background-color: #eee; }
</style>
</head>
<body>
<h1>Steam Backup Report</h1>
<table>
<tr>
  <th>Name</th>
  <th>AppID</th>
  <th>Installed Build</th>
  <th>Latest Build</th>
  <th>Latest Build Updated</th>
  <th>Status</th>
</tr>
"@

foreach ($r in $Results) {
    $statusClass = if ($r.Status -eq "✅ Up to date" -or $r.Status -eq "✅ Up-to-date") { "status-up-to-date" } elseif ($r.Status -eq "⚠️ Update available") { "status-update" } else { "" }
    $extraLink = ""
    $sinceDate = $r.LatestDate ? (Get-Date $r.LatestDate) : (Get-Date).AddYears(-1)
    $skidrowLinks = Get-SkidrowLinks -gameName $r.Name -sinceDate $sinceDate
    if ($skidrowLinks.Count -gt 0) {
        $extraLink = " <a href='" + $skidrowLinks[0] + "' target='_blank' title='SkidrowReloaded'><span style='font-size:1.2em;'>&#128279;</span></a>"
    }
    $HTML += "<tr class='$statusClass'><td>$($r.Name)</td><td>$($r.AppID)</td><td>$($r.InstalledBuild)</td><td>$($r.LatestBuild)</td><td>$($r.LatestDate)</td><td>$($r.Status)$extraLink</td></tr>`n"
}

$HTML += "</table>"
$HTML += "<p class='subtle'>Report generated on $DateNow ($RunMode)</p>"
$HTML += "</body></html>"

$HTML | Set-Content $ReportFile

Write-Host "✅ HTML report saved to: $ReportFile"

if ($env:GITHUB_TOKEN -or -not $IsGitHubActions) {
    Write-Host "📤 Committing and pushing report to GitHub..."
    git -C $RepoPath config user.name $GitUserName
    git -C $RepoPath config user.email $GitUserEmail
    git -C $RepoPath add index.html, games.json
    git -C $RepoPath commit -m "Update Steam backup report $DateNow" -a
    git -C $RepoPath pull --strategy=ours
    git -C $RepoPath push
    Write-Host "✅ GitHub Pages updated! Check your repo."
}
