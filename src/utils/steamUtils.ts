/**
 * Steam API utilities for fetching build information
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as path from 'path';
import { LatestBuildInfo } from '../types';

type SteamReviewSummary = {
  ratingPercent: number | null;
  total: number | null;
  positive: number | null;
  negative: number | null;
  summary: string | null;
};

function fetchSteamReviewSummary(appId: number): Promise<SteamReviewSummary> {
  // SteamDB “Rating” is derived from Steam user review stats.
  // This endpoint is public and returns totals + a text summary like “Very Positive”.
  const url = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=summary&language=all&purchase_type=all`;

  return new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'SteamVersionChecker' } },
      (res) => {
        const status = res.statusCode ?? 0;
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (status < 200 || status >= 300) {
            if (process.env.STEAMCMD_RATING_DEBUG === '1') {
              console.log(`appreviews HTTP ${status} for AppID ${appId}`);
              console.log(body.substring(0, 500));
            }
            resolve({
              ratingPercent: null,
              total: null,
              positive: null,
              negative: null,
              summary: null,
            });
            return;
          }

          try {
            const json = JSON.parse(body);
            const qs = json?.query_summary;
            const total =
              typeof qs?.total_reviews === 'number' ? qs.total_reviews : null;
            const positive =
              typeof qs?.total_positive === 'number' ? qs.total_positive : null;
            const negative =
              typeof qs?.total_negative === 'number' ? qs.total_negative : null;
            const summary =
              typeof qs?.review_score_desc === 'string'
                ? qs.review_score_desc
                : null;

            const ratingPercent =
              total && positive != null ? (positive / total) * 100 : null;

            resolve({ ratingPercent, total, positive, negative, summary });
          } catch (e) {
            if (process.env.STEAMCMD_RATING_DEBUG === '1') {
              console.log(
                `Failed to parse appreviews JSON for AppID ${appId}:`,
                e
              );
              console.log(body.substring(0, 500));
            }
            resolve({
              ratingPercent: null,
              total: null,
              positive: null,
              negative: null,
              summary: null,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      if (process.env.STEAMCMD_RATING_DEBUG === '1') {
        console.log(`appreviews request error for AppID ${appId}:`, err);
      }
      resolve({
        ratingPercent: null,
        total: null,
        positive: null,
        negative: null,
        summary: null,
      });
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout'));
    });
  });
}

/**
 * Get latest build information from Steam using steamcmd
 */
export async function getLatestBuild(
  appId: number,
  steamCmdPath: string
): Promise<LatestBuildInfo> {
  try {
    const tempFile = path.join(
      os.tmpdir(),
      `steamcmd_output_${appId}_${Date.now()}.txt`
    );

    // Detect platform
    const isWindows = process.platform === 'win32';

    // Properly quote paths and redirect output
    const quotedSteamCmdPath = isWindows
      ? `"${steamCmdPath.replace(/\\/g, '\\\\')}"`
      : `"${steamCmdPath}"`;

    const redirect = isWindows ? `> "${tempFile}" 2>&1` : `> ${tempFile} 2>&1`;

    const command = `${quotedSteamCmdPath} +login anonymous +app_info_update 1 +app_info_print ${appId} +quit ${redirect}`;

    console.log(`Running SteamCMD: ${command}`);

    try {
      execSync(command, {
        // ✅ Use cmd.exe instead of PowerShell to avoid + parsing issue
        shell: isWindows ? 'cmd.exe' : '/bin/bash',
        stdio: 'inherit',
        timeout: 60000, // 60 second timeout
      });
    } catch (error: any) {
      // SteamCMD often exits with non-zero even on success
      console.log(`SteamCMD exited with code: ${error.status ?? 'unknown'}`);
    }

    let content = '';
    if (fs.existsSync(tempFile)) {
      content = fs.readFileSync(tempFile, 'utf-8');
      console.log(`SteamCMD output length: ${content.length} bytes`);
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // ignore delete errors
      }
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
      if (content.length > 0) {
        console.log('Output preview:', content.substring(0, 500));
      }
    }

    // Parse timeupdated
    const timeUpdatedMatch = content.match(/"timeupdated"\s+"(\d+)"/);
    if (timeUpdatedMatch) {
      timeUpdated = parseInt(timeUpdatedMatch[1], 10);
    }

    // SteamDB-style rating (user review percent + counts)
    const review = await fetchSteamReviewSummary(appId);

    return {
      BuildID: buildId,
      TimeUpdated: timeUpdated,
      RatingPercent: review.ratingPercent,
      ReviewsTotal: review.total,
      ReviewsPositive: review.positive,
      ReviewsNegative: review.negative,
      ReviewSummary: review.summary,
    };
  } catch (error) {
    console.error(`Error fetching build info for AppID ${appId}:`, error);
    return {
      BuildID: null,
      TimeUpdated: null,
      RatingPercent: null,
      ReviewsTotal: null,
      ReviewsPositive: null,
      ReviewsNegative: null,
      ReviewSummary: null,
    };
  }
}
