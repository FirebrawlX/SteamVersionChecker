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

    // Use shell to properly expand the path and redirect output
    const command = `${steamCmdPath} +login anonymous +app_info_update 1 +app_info_print ${appId} +quit > ${tempFile} 2>&1`;

    console.log(`Running SteamCMD: ${command}`);

    try {
      execSync(command, {
        shell: '/bin/bash',
        timeout: 60000, // 60 second timeout
      });
    } catch (error: any) {
      // SteamCMD often exits with non-zero even on success
      console.log(`SteamCMD exited with code: ${error.status || 'unknown'}`);
    }

    let content = '';
    if (fs.existsSync(tempFile)) {
      content = fs.readFileSync(tempFile, 'utf-8');
      console.log(`SteamCMD output length: ${content.length} bytes`);
      fs.unlinkSync(tempFile);
    } else {
      console.error(`Temp file not found: ${tempFile}`);
    }

    let buildId: number | null = null;
    let timeUpdated: number | null = null;

    // Parse buildid
    const buildIdMatch = content.match(/"buildid"\s+"(\d+)"/);
    if (buildIdMatch) {
      buildId = parseInt(buildIdMatch[1], 10);
      console.log(`Found buildid: ${buildId}`);
    } else {
      console.log('No buildid found in output');
      // Log first 500 chars of output for debugging
      if (content.length > 0) {
        console.log('Output preview:', content.substring(0, 500));
      }
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
