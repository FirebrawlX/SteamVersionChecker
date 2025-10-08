/**
 * Steam API utilities for fetching build information
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LatestBuildInfo } from '../types';

/**
 * Get latest build information from Steam using steamcmd
 */
export function getLatestBuild(
  appId: number,
  steamCmdPath: string
): LatestBuildInfo {
  try {
    const tempFile = path.join(
      os.tmpdir(),
      `steamcmd_output_${appId}_${Date.now()}.txt`
    );

    const command = `"${steamCmdPath}" +login anonymous +app_info_update 1 +app_info_print ${appId} +quit`;

    try {
      execSync(command, {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        timeout: 60000, // 60 second timeout
      });
    } catch (error: any) {
      // SteamCMD often exits with non-zero even on success, so we capture the output
      const output = error.stdout || error.stderr || '';
      fs.writeFileSync(tempFile, output, 'utf-8');
    }

    let content = '';
    if (fs.existsSync(tempFile)) {
      content = fs.readFileSync(tempFile, 'utf-8');
      fs.unlinkSync(tempFile);
    }

    let buildId: number | null = null;
    let timeUpdated: number | null = null;

    // Parse buildid
    const buildIdMatch = content.match(/"buildid"\s+"(\d+)"/);
    if (buildIdMatch) {
      buildId = parseInt(buildIdMatch[1], 10);
    }

    // Parse timeupdated
    const timeUpdatedMatch = content.match(/"timeupdated"\s+"(\d+)"/);
    if (timeUpdatedMatch) {
      timeUpdated = parseInt(timeUpdatedMatch[1], 10);
    }

    return {
      BuildID: buildId,
      TimeUpdated: timeUpdated,
    };
  } catch (error) {
    console.error(`Error fetching build info for AppID ${appId}:`, error);
    return {
      BuildID: null,
      TimeUpdated: null,
    };
  }
}
