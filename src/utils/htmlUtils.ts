/**
 * HTML report generation utilities
 */

import * as fs from 'fs';
import { GameData } from '../types';

/**
 * Format ISO date string to YYYY-MM-DD format
 */
function formatDateForDisplay(isoDateString?: string): string {
  if (!isoDateString) return '';
  try {
    return isoDateString.split('T')[0]; // Extract YYYY-MM-DD from ISO string
  } catch {
    return isoDateString;
  }
}

function getSkidrowSearchUrl(gameName: string): string {
  const query = gameName
    .split('.')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part.toLowerCase()))
    .join('+');
  return `https://www.skidrowreloaded.com/?s=${query}`;
}

/**
 * Generate HTML report from game results
 */
export function generateHtmlReport(
  results: GameData[],
  dateNow: string,
  runMode: string,
  reportFile: string
): void {
  // Sort results by Name
  const sortedResults = [...results].sort((a, b) =>
    a.Name.localeCompare(b.Name)
  );
  let html = `<!DOCTYPE html>
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
.name-link { color: inherit; text-decoration: none; display: block; width: 100%; height: 100%; }
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
`;

  for (const r of sortedResults) {
    let statusClass = '';
    if (r.Status === '✅ Up to date' || r.Status === '✅ Up-to-date') {
      statusClass = 'status-up-to-date';
    } else if (r.Status === '⚠️ Update available') {
      statusClass = 'status-update';
    }

    const nameLink = getSkidrowSearchUrl(r.Name);

    const formattedDate = formatDateForDisplay(r.LatestDate);

    html += `<tr class="${statusClass}"><td><a class="name-link" href="${nameLink}">${
      r.Name
    }</a></td><td>${r.AppID}</td><td>${r.InstalledBuild ?? ''}</td><td>${
      r.LatestBuild ?? ''
    }</td><td>${formattedDate}</td><td>${r.Status ?? ''}</td></tr>\n`;
  }

  html += '</table>';
  html += `<p class="subtle">Report generated on ${dateNow} (${runMode})</p>`;
  html += '</body></html>';

  fs.writeFileSync(reportFile, html, 'utf-8');
}
