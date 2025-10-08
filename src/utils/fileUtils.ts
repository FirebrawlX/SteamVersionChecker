/**
 * File system utilities for reading and writing game data
 */

import * as fs from 'fs';
import * as path from 'path';
import { GamesDataMap, GameData } from '../types';

/**
 * Check if running in GitHub Actions environment
 */
export function isGitHubActions(): boolean {
  return process.env.GITHUB_ACTIONS === 'true';
}

/**
 * Get the path to the report HTML file
 */
export function getReportFile(repoPath: string): string {
  return path.join(repoPath, 'index.html');
}

/**
 * Get the path to the games JSON data file
 */
export function getDataFile(repoPath: string): string {
  return path.join(repoPath, 'games.json');
}

/**
 * Read games data from JSON file
 */
export function readGamesData(dataFile: string): GamesDataMap {
  if (fs.existsSync(dataFile)) {
    const content = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(content);
    console.log('Loaded games.json successfully');
    return data;
  } else {
    console.log('No games.json found, starting with empty data');
    return {};
  }
}

/**
 * Write games data to JSON file
 */
export function writeGamesData(
  dataFile: string,
  gamesData: GamesDataMap
): void {
  fs.writeFileSync(dataFile, JSON.stringify(gamesData, null, 2), 'utf-8');
}

/**
 * Get local backups from directory by scanning .7z files
 */
export function getLocalBackups(backupDir: string): GameData[] {
  const backups: GameData[] = [];

  if (!fs.existsSync(backupDir)) {
    console.log(`Backup directory not found: ${backupDir}`);
    return backups;
  }

  const files = fs.readdirSync(backupDir);

  for (const file of files) {
    if (file.endsWith('.7z')) {
      const baseName = file.replace('.7z', '');
      const parts = baseName.split('_');

      if (parts.length >= 3) {
        const buildId = parts[parts.length - 1];
        const appId = parts[parts.length - 2];
        const name = parts.slice(0, parts.length - 2).join('_');

        backups.push({
          Name: name,
          AppID: parseInt(appId, 10),
          InstalledBuild: parseInt(buildId, 10),
        });
      }
    }
  }

  return backups;
}
