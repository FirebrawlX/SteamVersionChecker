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

# Detect if running in GitHub Actions
$IsGitHubActions = $env:GITHUB_ACTIONS -eq "true"

# File paths inside the repo
$ReportFile = Join-Path $RepoPath "index.html"
$DataFile   = Join-Path $RepoPath "games.json"

# Load previous known games data if exists
$GamesData = @{}
if (Test-Path $DataFile) {
    $GamesData = Get-Content $DataFile | ConvertFrom-Json
    Write-Host "Loaded GamesData:"
    $GamesData | ConvertTo-Json -Depth 5 | Write-Host
} else {
    Write-Host "No games.json found at $DataFile"
}

# Function to parse local backups (only if running locally)
function Get-LocalBackups {
    param($BackupDir)
    $backups = @()
    if (Test-Path $BackupDir) {
        Get-ChildItem $BackupDir -Filter "*.7z" | ForEach-Object {
            # Expecting filename: name_appid_buildid.7z
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

# Get list of games to check
if ($IsGitHubActions) {
    Write-Host "📡 Running in GitHub Actions mode. Scanning for updates..."
    # Build array from hashtable keys
    $GamesToCheck = @()
    foreach ($property in $GamesData.PSObject.Properties) {
      $GamesToCheck += $property.Value
    }
} else {
    Write-Host "📦 Running locally. Scanning backups in $BackupDir ..."
    $GamesToCheck = Get-LocalBackups -BackupDir $BackupDir

    # Merge new local data with previous data
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
    # Save merged JSON
    $GamesData | ConvertTo-Json -Depth 5 | Set-Content $DataFile
}

Write-Host "Number of games to process: $($GamesToCheck.Count)"

# Function to fetch latest build via SteamCMD
function Get-LatestBuild {
    param($AppID, $SteamCmdPath)

    $tempFile = New-TemporaryFile
    $cmd = "$SteamCmdPath +login anonymous +app_info_update 1 +app_info_print $AppID +quit"
    Write-Host "Running: $cmd"
    & $SteamCmdPath +login anonymous +app_info_update 1 +app_info_print $AppID +quit > $tempFile 2>&1
    $content = Get-Content $tempFile -Raw
    Write-Host "SteamCMD output for AppID ${AppID}:`n$content"
    Remove-Item $tempFile -Force

    # Parse latest build ID from JSON-like structure
    if ($content -match '"buildid"\s*"(\d+)"') {
        return [int]$matches[1]
    } else {
        return $null
    }
}

# Now, always check for updates for each game in $GamesToCheck
$Results = @()
$Counter = 1
$Total = $GamesToCheck.Count
foreach ($game in $GamesToCheck) {
    Write-Host "Processing game: $($game.Name) (AppID=$($game.AppID))"
    $latestBuild = Get-LatestBuild -AppID $game.AppID -SteamCmdPath $SteamCmdPath

    # Get previous build and date
    $prevBuild = $GamesData[$game.AppID].LatestBuild
    $prevDate = $GamesData[$game.AppID].PSObject.Properties['LatestDate'] ? $GamesData[$game.AppID].LatestDate : $null
    
    # If build changed or date missing, set new date
    if (($latestBuild -ne $prevBuild) -or (-not $prevDate)) {
      $newDate = (Get-Date).ToUniversalTime().AddHours(2).ToString("yyyy-MM-ddTHH:mm:ssZ") # Stockholm time, ISO format
      if ($GamesData[$game.AppID].PSObject.Properties['LatestDate']) {
        $GamesData[$game.AppID].LatestDate = $newDate
      } else {
        $GamesData[$game.AppID] | Add-Member -MemberType NoteProperty -Name LatestDate -Value $newDate
      }
    }
    
    # Always update LatestBuild
    if ($GamesData[$game.AppID].PSObject.Properties['LatestBuild']) {
      $GamesData[$game.AppID].LatestBuild = $latestBuild
    } else {
      $GamesData[$game.AppID] | Add-Member -MemberType NoteProperty -Name LatestBuild -Value $latestBuild
    }

    # Determine status
    $status = ""
    if ($latestBuild -eq $null) {
        $status = "❌ Could not fetch latest"
    } elseif ($latestBuild -gt $game.InstalledBuild) {
        $status = "⚠️ Update available"
    } else {
        $status = "✅ Up to date"
    }

    # Update stored latest build
    if ($GamesData[$game.AppID].PSObject.Properties['LatestBuild']) {
      $GamesData[$game.AppID].LatestBuild = $latestBuild
    } else {
      $GamesData[$game.AppID] | Add-Member -MemberType NoteProperty -Name LatestBuild -Value $latestBuild
    }
    $Results += [PSCustomObject]@{
        Name          = $game.Name
        AppID         = $game.AppID
        InstalledBuild= $game.InstalledBuild
        LatestBuild   = $latestBuild
        Status        = $status
    }
    $Counter++
}

# Save updated data
$GamesData | ConvertTo-Json -Depth 5 | Set-Content $DataFile

# Generate HTML report
$DateNow = Get-Date -Format "yyyy-MM-dd HH:mm"
$RunMode = if ($IsGitHubActions) { "GitHub Actions" } else { "Local run" }

# Set timezone to Europe/Stockholm (UTC+2)
$DateNow = (Get-Date).ToUniversalTime().AddHours(2).ToString("yyyy-MM-dd HH:mm")
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
.status-up-to-date { background-color: #c6efce; }    /* light green */
.status-update { background-color: #ffc7ce; }       /* light red */
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
  <th>Latest Build Date</th>
  <th>Status</th>
</tr>
"@

foreach ($r in $Results) {
    $statusClass = if ($r.Status -eq "✅ Up to date" -or $r.Status -eq "✅ Up-to-date") { "status-up-to-date" } elseif ($r.Status -eq "⚠️ Update available") { "status-update" } else { "" }
    $latestDate = ""
    if ($r.PSObject.Properties['LatestDate'] -and $r.LatestDate) {
        $latestDate = $r.LatestDate
    } elseif ($GamesData[$r.AppID].PSObject.Properties['LatestDate'] -and $GamesData[$r.AppID].LatestDate) {
        $latestDate = $GamesData[$r.AppID].LatestDate
    } elseif ($r.LatestBuild) {
        # If no date exists, use the current time in ISO format
        $latestDate = (Get-Date).ToUniversalTime().AddHours(2).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    $HTML += "<tr class='$statusClass'><td>$($r.Name)</td><td>$($r.AppID)</td><td>$($r.InstalledBuild)</td><td>$($r.LatestBuild)</td><td>$latestDate</td><td>$($r.Status)</td></tr>`n"
}

$HTML += "</table>"
$HTML += "<p class='subtle'>Report generated on $DateNow ($RunMode)</p>"
$HTML += "</body></html>"

$HTML | Set-Content $ReportFile

Write-Host "✅ HTML report saved to: $ReportFile"

# Commit & push if running locally or if GITHUB_TOKEN exists
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
