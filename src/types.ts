/**
 * Type definitions for Steam Backup Report
 */

export interface Params {
  BackupDir: string;
  SteamCmdPath: string;
  RepoPath: string;
  GitUserName: string;
  GitUserEmail: string;
}

export interface GameData {
  Name: string;
  AppID: number;
  InstalledBuild?: number;
  LatestBuild?: number;
  LatestDate?: string;
  Status?: string;
  SkidrowLink?: string;
}

export interface GamesDataMap {
  [appId: number]: GameData;
}

export interface LatestBuildInfo {
  BuildID: number | null;
  TimeUpdated: number | null;
}
