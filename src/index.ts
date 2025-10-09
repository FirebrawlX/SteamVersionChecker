#!/usr/bin/env node
/**
 * Steam Backup Report - Main Entry Point
 *
 * Checks local Steam backup versions and polls Steam for updates.
 * Supports both local execution and GitHub Actions polling.
 */

import { execSync } from 'child_process';
import { Params, GameData, GamesDataMap } from './types';
import {
  isGitHubActions,
  getReportFile,
  getDataFile,
  readGamesData,
  writeGamesData,
  getLocalBackups,
} from './utils/fileUtils';
import { getLatestBuild } from './utils/steamUtils';
import { getSkidrowLinks } from './utils/rssUtils';
import { generateHtmlReport } from './utils/htmlUtils';

/**
 * Parse command line arguments
 */
function parseArgs(): Params {
  const args = process.argv.slice(2);
  const params: Partial<Params> = {
    BackupDir: '.',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const value = args[i + 1];

      switch (key) {
        case 'BackupDir':
          params.BackupDir = value;
          i++;
          break;
        case 'SteamCmdPath':
          params.SteamCmdPath = value;
          i++;
          break;
        case 'RepoPath':
          params.RepoPath = value;
          i++;
          break;
        case 'GitUserName':
          params.GitUserName = value;
          i++;
          break;
        case 'GitUserEmail':
          params.GitUserEmail = value;
          i++;
          break;
      }
    }
  }

  // Validate required parameters
  if (
    !params.SteamCmdPath ||
    !params.RepoPath ||
    !params.GitUserName ||
    !params.GitUserEmail
  ) {
    console.error('Missing required parameters!');
    console.error(
      'Usage: node index.js --SteamCmdPath <path> --RepoPath <path> --GitUserName <name> --GitUserEmail <email> [--BackupDir <path>]'
    );
    process.exit(1);
  }

  return params as Params;
}

/**
 * Main logic
 */
async function main(params: Params) {
  console.log('Starting Steam Backup Report...');
  const isActions = isGitHubActions();
  console.log('GitHub Actions mode:', isActions);

  const reportFile = getReportFile(params.RepoPath);
  const dataFile = getDataFile(params.RepoPath);

  let gamesData: GamesDataMap = readGamesData(dataFile);
  console.log('Loaded gamesData keys:', Object.keys(gamesData));

  let gamesToCheck: GameData[] = [];

  if (isActions) {
    // In GitHub Actions, check all games from games.json
    gamesToCheck = Object.values(gamesData);
    console.log('Games to check from games.json:', gamesToCheck.length);
  } else {
    // Local mode: scan backups directory
    const localBackups = getLocalBackups(params.BackupDir);
    console.log('Local backups found:', localBackups.length);

    // Safe merge: update existing entries, add new local games, leave missing games intact
    for (const backup of localBackups) {
      if (gamesData[backup.AppID]) {
        // Only update installed info and name
        gamesData[backup.AppID].Name = backup.Name;
        gamesData[backup.AppID].InstalledBuild = backup.InstalledBuild;
      } else {
        // Add new local game
        gamesData[backup.AppID] = backup;
      }
    }

    gamesToCheck = localBackups;
    console.log('Games to check after merging:', gamesToCheck.length);
  }

  const results: GameData[] = [];

  // Process each game
  for (const game of gamesToCheck) {
    console.log(`Processing game: ${game.Name} (AppID: ${game.AppID})`);

    // Get latest build from Steam
    const latestInfo = getLatestBuild(game.AppID, params.SteamCmdPath);
    console.log(`SteamCMD result for ${game.Name}:`, latestInfo);

    const latestBuild = latestInfo.BuildID;
    const latestTimeUpdated = latestInfo.TimeUpdated;
    let latestDate = '';

    const prevBuild = gamesData[game.AppID]?.LatestBuild;
    const prevDate = gamesData[game.AppID]?.LatestDate;

    // Determine latest date
    if (latestTimeUpdated) {
      latestDate = new Date(latestTimeUpdated * 1000).toISOString();
      gamesData[game.AppID].LatestDate = latestDate;
    } else if (latestBuild !== prevBuild || !prevDate) {
      latestDate = new Date().toISOString();
      gamesData[game.AppID].LatestDate = latestDate;
    } else {
      latestDate = prevDate ?? '';
    }

    gamesData[game.AppID].LatestBuild =
      latestBuild === null ? undefined : latestBuild;

    // Fetch SkidrowReloaded link
    const sinceDate = latestDate
      ? new Date(latestDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    let skidrowLink = '';
    try {
      const links = await getSkidrowLinks(game.Name, sinceDate);
      console.log(`Skidrow links for ${game.Name}:`, links);

      if (links.length > 0) {
        skidrowLink = links[0];
        gamesData[game.AppID].SkidrowLink = skidrowLink;
      } else if (gamesData[game.AppID].SkidrowLink) {
        skidrowLink = gamesData[game.AppID].SkidrowLink ?? '';
      }
    } catch (err) {
      console.log(`Error fetching Skidrow links for ${game.Name}:`, err);
      if (gamesData[game.AppID].SkidrowLink) {
        skidrowLink = gamesData[game.AppID].SkidrowLink ?? '';
      }
    }

    // Determine status
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
      SkidrowLink: skidrowLink,
    });
  }

  console.log('Results:', results);

  // Save updated games data
  writeGamesData(dataFile, gamesData);
  console.log('games.json updated.');

  // Generate HTML report (Stockholm time)
  const dateNow = new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour12: false })
    .replace(',', ' ')
    .replace(' ', ' ');
  const runMode = isActions ? 'GitHub Actions' : 'Local run';

  generateHtmlReport(results, dateNow, runMode, reportFile);
  console.log('HTML report generated:', reportFile);

  // Git commit and push
  if (process.env.GITHUB_TOKEN || !isActions) {
    try {
      console.log('Committing and pushing changes...');
      execSync(
        `git -C "${params.RepoPath}" config user.name "${params.GitUserName}"`
      );
      execSync(
        `git -C "${params.RepoPath}" config user.email "${params.GitUserEmail}"`
      );
      execSync(`git -C "${params.RepoPath}" add index.html games.json`);
      execSync(
        `git -C "${params.RepoPath}" commit -m "Update Steam backup report ${dateNow}" -a`
      );
      execSync(`git -C "${params.RepoPath}" pull --strategy=ours`);
      execSync(`git -C "${params.RepoPath}" push`);
      console.log('Git commit and push completed.');
    } catch (err) {
      console.log('Git commit/push error:', err);
    }
  }

  console.log('Steam Backup Report finished.');
}

// Run if called directly
if (require.main === module) {
  const params = parseArgs();
  main(params).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main };
