/**
 * Steam API utilities for fetching build information
 */

import { execFile } from 'child_process';
import * as https from 'https';
import { promisify } from 'util';
import { LatestBuildInfo } from '../types';

const execFileAsync = promisify(execFile);

function extractLines(
  content: string,
  maxLines: number,
  fromEnd = false
): string[] {
  const lines = content.split(/\r?\n/);
  if (!fromEnd) return lines.slice(0, maxLines);
  return lines.slice(Math.max(0, lines.length - maxLines));
}

function extractMatchingLines(
  content: string,
  pattern: RegExp,
  maxLines: number
): string[] {
  const lines = content.split(/\r?\n/);
  const matches: string[] = [];
  for (const line of lines) {
    if (pattern.test(line)) {
      matches.push(line);
      if (matches.length >= maxLines) break;
    }
  }
  return matches;
}

function logMissingBuildIdDebug(appId: number, first: string, retry?: string) {
  const combined = retry != null ? retry : first;
  const firstLen = first.length;
  const retryLen = retry?.length;
  const hasQuotedRoot = combined.includes(`"${appId}"`);
  const hasBuildIdLiteral = /"buildid"\s+"\d+"/.test(combined);
  const hasDepotsSection = /"depots"\s*\{/.test(combined);
  const hasBranchesSection = /"branches"\s*\{/.test(combined);
  const hasPublicBranch = /"public"\s*\{/.test(combined);

  const changeLine = extractMatchingLines(
    combined,
    /AppID\s*:\s*\d+\s*,\s*change number\s*:/i,
    3
  );

  const interesting = extractMatchingLines(
    combined,
    /(app_info_print|app_info_update|AppID\s*:|change number|"common"|"depots"|"branches"|"public"|buildid|timeupdated|ERROR|FAILED|Redirecting stderr)/i,
    80
  );

  console.log('--- SteamCMD buildid missing debug ---');
  console.log(`AppID: ${appId}`);
  console.log(
    `Output length: ${firstLen}${retry != null ? ` (retry: ${retryLen})` : ''}`
  );
  console.log(`Contains quoted root "${appId}": ${hasQuotedRoot}`);
  console.log(`Contains any "buildid" key: ${hasBuildIdLiteral}`);
  console.log(
    `Has depots/branches/public sections: depots=${hasDepotsSection} branches=${hasBranchesSection} public=${hasPublicBranch}`
  );
  if (!hasDepotsSection) {
    console.log(
      'Likely cause: SteamCMD did not include depot/branch data for this app (often an anonymous-access restriction).'
    );
    console.log(
      'SteamDB can still show builds because it uses a logged-in Steam account; SteamCMD anonymous may not have permission to see depots/build IDs.'
    );
  }
  if (changeLine.length) {
    console.log('Change number line(s):');
    for (const l of changeLine) console.log(l);
  }
  if (interesting.length) {
    console.log('Interesting lines (up to 80):');
    for (const l of interesting) console.log(l);
  }
  console.log('First lines (up to 40):');
  for (const l of extractLines(combined, 40)) console.log(l);
  console.log('Last lines (up to 40):');
  for (const l of extractLines(combined, 40, true)) console.log(l);

  console.log(
    'Tip: rerun with STEAMCMD_RATING_DEBUG=1 for extra HTTP/appreviews diagnostics.'
  );
  console.log('--- end debug ---');
}

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

async function runSteamCmdAppInfo(
  appId: number,
  steamCmdPath: string
): Promise<string> {
  const args = [
    '+login',
    'anonymous',
    '+app_info_update',
    '1',
    '+app_info_print',
    String(appId),
    '+quit',
  ];

  try {
    const { stdout, stderr } = await execFileAsync(steamCmdPath, args, {
      timeout: 60000,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    return `${stdout ?? ''}\n${stderr ?? ''}`;
  } catch (error: any) {
    // SteamCMD often exits non-zero even when output is usable.
    const stdout = error?.stdout ?? '';
    const stderr = error?.stderr ?? '';
    return `${stdout}\n${stderr}`;
  }
}

/**
 * Get latest build information from Steam using steamcmd
 */
export async function getLatestBuild(
  appId: number,
  steamCmdPath: string
): Promise<LatestBuildInfo> {
  try {
    console.log(
      `Running SteamCMD: ${steamCmdPath} +login anonymous +app_info_update 1 +app_info_print ${appId} +quit`
    );

    const firstContent = await runSteamCmdAppInfo(appId, steamCmdPath);
    let content = firstContent;
    console.log(`SteamCMD output length: ${content.length} bytes`);

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

      // Retry once: SteamCMD/appinfo can be flaky for some apps.
      console.log(`Retrying SteamCMD app_info_print for AppID ${appId}...`);
      const retryContent = await runSteamCmdAppInfo(appId, steamCmdPath);
      content = retryContent;
      console.log(`SteamCMD output length (retry): ${content.length} bytes`);
      const retryMatch = content.match(/"buildid"\s+"(\d+)"/);
      if (retryMatch) {
        buildId = parseInt(retryMatch[1], 10);
        console.log(`Found buildid (retry): ${buildId}`);
      } else {
        // Persistent missing buildid: log detailed diagnostics and dump output.
        logMissingBuildIdDebug(appId, firstContent, retryContent);
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
