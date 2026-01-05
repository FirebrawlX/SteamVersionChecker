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
  RatingPercent?: number;
  ReviewsTotal?: number;
  ReviewsPositive?: number;
  ReviewsNegative?: number;
  ReviewSummary?: string;
  Status?: string;
}

export interface GamesDataMap {
  [appId: number]: GameData;
}

export interface LatestBuildInfo {
  BuildID: number | null;
  TimeUpdated: number | null;
  RatingPercent: number | null;
  ReviewsTotal: number | null;
  ReviewsPositive: number | null;
  ReviewsNegative: number | null;
  ReviewSummary: string | null;
}
