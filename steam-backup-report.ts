/*
 * Copyright 2025 Sony Corporation
 */

// Steam Backup Report - Node.js/TypeScript Full Migration
// Mirrors PowerShell script logic, layout, and structure

import fs from 'fs';
import path from 'path';
// import axios from 'axios'; // Not used, removed
import Parser from 'rss-parser';
import { execSync } from 'child_process';

// --- Types ---
export interface GameData {
  Name: string;
  AppID: number;
  InstalledBuild?: number;
  LatestBuild?: number;
  LatestDate?: string;
  SkidrowLink?: string;
  Status?: string;
}

export interface Params {
  BackupDir: string;
  SteamCmdPath: string;
  RepoPath: string;
  GitUserName: string;
  GitUserEmail: string;
}

// --- Config ---
const DEFAULT_BACKUP_DIR = '.';
const DATA_FILE = 'games.json';
const REPORT_FILE = 'index.html';
const SKIDROW_RSS = 'https://feeds.feedburner.com/SkidrowReloadedGames';

// --- Utility Functions ---
export function isGitHubActions(): boolean {
  return process.env.GITHUB_ACTIONS === 'true';
}

export function getReportFile(repoPath: string): string {
  return path.join(repoPath, REPORT_FILE);
}

export function getDataFile(repoPath: string): string {
  return path.join(repoPath, DATA_FILE);
}

// --- Local Backup Scan ---
export function getLocalBackups(backupDir: string): GameData[] {
  const backups: GameData[] = [];
  if (!fs.existsSync(backupDir)) return backups;
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.7z'));
  for (const file of files) {
    const nameParts = path.basename(file, '.7z').split('_');
    if (nameParts.length >= 3) {
      const name = nameParts.slice(0, -2).join('_');
      const appId = parseInt(nameParts[nameParts.length - 2], 10);
      const buildId = parseInt(nameParts[nameParts.length - 1], 10);
  backups.push({ Name: name, AppID: appId, InstalledBuild: buildId });
    }
  }
  return backups;
}

// --- SteamCMD Integration ---
export function getLatestBuild(appId: number, steamCmdPath: string): { BuildID?: number, TimeUpdated?: number } {
  const tempFile = path.join('/tmp', `steamcmd_${appId}_${Date.now()}.txt`);
  try {
    execSync(`${steamCmdPath} +login anonymous +app_info_update 1 +app_info_print ${appId} +quit > ${tempFile}`);
    const content = fs.readFileSync(tempFile, 'utf-8');
    fs.unlinkSync(tempFile);
    const buildIdMatch = content.match(/"buildid"\s*"(\d+)"/);
    const timeUpdatedMatch = content.match(/"timeupdated"\s*"(\d+)"/);
    return {
      BuildID: buildIdMatch ? parseInt(buildIdMatch[1], 10) : undefined,
      TimeUpdated: timeUpdatedMatch ? parseInt(timeUpdatedMatch[1], 10) : undefined
    };
  } catch {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  return { BuildID: undefined, TimeUpdated: undefined };
  }
}

// --- SkidrowReloaded RSS Parsing ---
export async function getSkidrowLinks(gameName: string, sinceDate: Date): Promise<string[]> {
  const parser = new Parser();
  const feed = await parser.parseURL(SKIDROW_RSS);
  const normalizedGameName = gameName.toLowerCase().replace(/\.|\s/g, '');
  const links: string[] = [];
  for (const item of feed.items) {
    const pubDate = item.pubDate ? new Date(item.pubDate) : null;
    if (!pubDate || pubDate < sinceDate) continue;
    if (item.categories) {
      for (const cat of item.categories) {
        const normalizedCat = cat.toLowerCase().replace(/\.|\s/g, '');
        if (normalizedCat === normalizedGameName && item.link && item.link.startsWith('https://www.skidrowreloaded.com/')) {
          links.push(item.link);
        }
      }
    }
  }
  return links;
}

// --- Data Persistence ---
export function readGamesData(dataFile: string): Record<number, GameData> {
  if (!fs.existsSync(dataFile)) return {};
  try {
    const raw = fs.readFileSync(dataFile, 'utf-8');
    const parsed = JSON.parse(raw);
    // If it's an array, convert to object
    if (Array.isArray(parsed)) {
      const map: Record<number, GameData> = {};
      for (const g of parsed) map[g.AppID] = g;
      return map;
    }
    // If it's already an object (your format), return as-is
    return parsed;
  } catch {
    return {};
  }
}

export function writeGamesData(dataFile: string, data: Record<number, GameData>): void {
  const arr = Object.values(data);
  fs.writeFileSync(dataFile, JSON.stringify(arr, null, 2), 'utf-8');
}

// --- HTML Report Generation ---
export function generateHtmlReport(results: GameData[], dateNow: string, runMode: string, outPath: string): void {
  const rows = results.map(r => {
  const statusClass = r.Status === '✅ Up to date' ? 'status-up-to-date' : (r.Status === '⚠️ Update available' ? 'status-update' : '');
  const extraLink = r.SkidrowLink && r.SkidrowLink.startsWith('https://www.skidrowreloaded.com/') ? ` <a href='${r.SkidrowLink}' target='_blank' title='SkidrowReloaded'><span style='font-size:1.2em;'>&#128279;</span></a>` : '';
  return `<tr class='${statusClass}'><td>${r.Name}</td><td>${r.AppID}</td><td>${r.InstalledBuild ?? ''}</td><td>${r.LatestBuild ?? ''}</td><td>${r.LatestDate ?? ''}</td><td>${r.Status ?? ''}${extraLink}</td></tr>`;
  }).join('\n');
  const html = `<!DOCTYPE html>
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
${rows}
</table>
<p class='subtle'>Report generated on ${dateNow} (${runMode})</p>
</body></html>`;
  fs.writeFileSync(outPath, html, 'utf-8');
}

// --- Main Logic ---
export async function main(params: Params) {
  const isActions = isGitHubActions();
  const reportFile = getReportFile(params.RepoPath);
  const dataFile = getDataFile(params.RepoPath);

  let gamesData = readGamesData(dataFile);
  let gamesToCheck: GameData[] = [];

  if (isActions) {
    gamesToCheck = Object.values(gamesData);
  } else {
    const localBackups = getLocalBackups(params.BackupDir);
    for (const g of localBackups) {
      if (gamesData[g.AppID]) {
        gamesData[g.AppID].Name = g.Name;
        gamesData[g.AppID].InstalledBuild = g.InstalledBuild;
      } else {
        gamesData[g.AppID] = g;
      }
    }
    writeGamesData(dataFile, gamesData);
    gamesToCheck = localBackups;
  }

  const results: GameData[] = [];
  for (const game of gamesToCheck) {
    const latestInfo = getLatestBuild(game.AppID, params.SteamCmdPath);
    const latestBuild = latestInfo.BuildID;
    const latestTimeUpdated = latestInfo.TimeUpdated;
    let latestDate = '';
    const prevBuild = gamesData[game.AppID]?.LatestBuild;
    const prevDate = gamesData[game.AppID]?.LatestDate;
    if (latestTimeUpdated) {
      latestDate = new Date(latestTimeUpdated * 1000).toISOString();
      gamesData[game.AppID].LatestDate = latestDate;
    } else if ((latestBuild !== prevBuild) || !prevDate) {
      latestDate = new Date().toISOString();
      gamesData[game.AppID].LatestDate = latestDate;
    } else {
      latestDate = prevDate ?? '';
    }
  gamesData[game.AppID].LatestBuild = latestBuild === null ? undefined : latestBuild;
    // SkidrowReloaded link
    const sinceDate = latestDate ? new Date(latestDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    let skidrowLink = '';
    try {
      const links = await getSkidrowLinks(game.Name, sinceDate);
      if (links.length > 0) {
        skidrowLink = links[0];
        gamesData[game.AppID].SkidrowLink = skidrowLink;
      } else if (gamesData[game.AppID].SkidrowLink) {
  skidrowLink = gamesData[game.AppID].SkidrowLink ?? '';
      }
    } catch {
      if (gamesData[game.AppID].SkidrowLink) {
  skidrowLink = gamesData[game.AppID].SkidrowLink ?? '';
      }
    }
    // Status
    let status = '';
    if (latestBuild == null) {
      status = '❌ Could not fetch latest';
    } else if (latestBuild > (game.InstalledBuild ?? 0)) {
      status = '⚠️ Update available';
    } else {
      status = '✅ Up to date';
    }
    results.push({
      Name: game.Name,
      AppID: game.AppID,
      InstalledBuild: game.InstalledBuild,
  LatestBuild: latestBuild === null ? undefined : latestBuild,
      LatestDate: latestDate,
      Status: status,
      SkidrowLink: skidrowLink
    });
  }
  writeGamesData(dataFile, gamesData);
  // Stockholm time
  const dateNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour12: false }).replace(' ', 'T');
  const runMode = isActions ? 'GitHub Actions' : 'Local run';
  generateHtmlReport(results, dateNow, runMode, reportFile);
  // Git commit/push
  if (process.env.GITHUB_TOKEN || !isActions) {
    try {
      execSync(`git -C ${params.RepoPath} config user.name "${params.GitUserName}"`);
      execSync(`git -C ${params.RepoPath} config user.email "${params.GitUserEmail}"`);
      execSync(`git -C ${params.RepoPath} add index.html games.json`);
      execSync(`git -C ${params.RepoPath} commit -m "Update Steam backup report ${dateNow}" -a`);
      execSync(`git -C ${params.RepoPath} pull --strategy=ours`);
      execSync(`git -C ${params.RepoPath} push`);
    } catch (err) {
      // Ignore git errors for now
    }
  }
}

// Example usage (uncomment and set params to run locally)
/*
main({
  BackupDir: '/path/to/backups',
  SteamCmdPath: '/path/to/steamcmd',
  RepoPath: '/path/to/repo',
  GitUserName: 'your-username',
  GitUserEmail: 'your-email@example.com'
});
*/

// All functions are modular and testable.
