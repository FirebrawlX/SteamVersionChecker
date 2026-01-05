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
import { generateHtmlReport } from './utils/htmlUtils';

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const concurrency = Math.max(1, Math.floor(limit));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());
  await Promise.all(workers);
  return results;
}

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
    // In GitHub Actions, check all games to generate a complete report
    gamesToCheck = Object.values(gamesData);
    console.log(`Games to check from games.json: ${gamesToCheck.length}`);
  } else {
    // Local mode: scan backups directory
    const localBackups = getLocalBackups(params.BackupDir);
    console.log('Local backups found:', localBackups.length);

    // Identify which games are new or have changed installed build
    const changedGames: GameData[] = [];
    for (const backup of localBackups) {
      const existing = gamesData[backup.AppID];
      if (!existing) {
        // New game
        changedGames.push(backup);
        gamesData[backup.AppID] = backup;
        console.log(`  NEW: ${backup.Name} (AppID: ${backup.AppID})`);
      } else if (existing.InstalledBuild !== backup.InstalledBuild) {
        // Game backup has been updated
        changedGames.push(backup);
        gamesData[backup.AppID].Name = backup.Name;
        gamesData[backup.AppID].InstalledBuild = backup.InstalledBuild;
        console.log(
          `  UPDATED: ${backup.Name} (AppID: ${backup.AppID}) - Build ${existing.InstalledBuild} -> ${backup.InstalledBuild}`
        );
      } else {
        // No change, but update name just in case
        gamesData[backup.AppID].Name = backup.Name;
      }
    }

    gamesToCheck = changedGames;
    console.log(
      `Games to check (changed/new): ${gamesToCheck.length} of ${localBackups.length}`
    );
  }

  const results: GameData[] = [];

  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT ?? '4', 10);
  console.log(
    `Processing with concurrency: ${
      isFinite(maxConcurrent) ? maxConcurrent : 4
    }`
  );

  const processed = await mapWithConcurrency(
    gamesToCheck,
    isFinite(maxConcurrent) ? maxConcurrent : 4,
    async (game) => {
      console.log(`Processing game: ${game.Name} (AppID: ${game.AppID})`);

      const latestInfo = await getLatestBuild(game.AppID, params.SteamCmdPath);
      console.log(`SteamCMD result for ${game.Name}:`, latestInfo);

      const latestBuild = latestInfo.BuildID;
      const latestTimeUpdated = latestInfo.TimeUpdated;
      const latestRatingPercent = latestInfo.RatingPercent;
      const latestReviewsTotal = latestInfo.ReviewsTotal;
      const latestReviewsPositive = latestInfo.ReviewsPositive;
      const latestReviewsNegative = latestInfo.ReviewsNegative;
      const latestReviewSummary = latestInfo.ReviewSummary;

      let latestDate = '';
      const prevBuild = gamesData[game.AppID]?.LatestBuild;
      const prevDate = gamesData[game.AppID]?.LatestDate;

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

      gamesData[game.AppID].RatingPercent =
        latestRatingPercent === null ? undefined : latestRatingPercent;
      gamesData[game.AppID].ReviewsTotal =
        latestReviewsTotal === null ? undefined : latestReviewsTotal;
      gamesData[game.AppID].ReviewsPositive =
        latestReviewsPositive === null ? undefined : latestReviewsPositive;
      gamesData[game.AppID].ReviewsNegative =
        latestReviewsNegative === null ? undefined : latestReviewsNegative;
      gamesData[game.AppID].ReviewSummary =
        latestReviewSummary === null ? undefined : latestReviewSummary;

      let status = '';
      if (latestBuild == null) {
        status = '❌ Could not fetch latest';
      } else if (latestBuild > (game.InstalledBuild ?? 0)) {
        status = '⚠️ Update available';
      } else {
        status = '✅ Up to date';
      }

      return {
        Name: game.Name,
        AppID: game.AppID,
        InstalledBuild: game.InstalledBuild,
        LatestBuild: latestBuild === null ? undefined : latestBuild,
        LatestDate: latestDate,
        RatingPercent:
          latestRatingPercent === null ? undefined : latestRatingPercent,
        ReviewsTotal:
          latestReviewsTotal === null ? undefined : latestReviewsTotal,
        ReviewsPositive:
          latestReviewsPositive === null ? undefined : latestReviewsPositive,
        ReviewsNegative:
          latestReviewsNegative === null ? undefined : latestReviewsNegative,
        ReviewSummary:
          latestReviewSummary === null ? undefined : latestReviewSummary,
        Status: status,
      } satisfies GameData;
    }
  );

  results.push(...processed);

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
