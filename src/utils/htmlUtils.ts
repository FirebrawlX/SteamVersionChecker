/**
 * HTML report generation utilities
 */

import * as fs from 'fs';
import { GameData } from '../types';

/**
 * Generate HTML report from game results
 */
export function generateHtmlReport(
  results: GameData[],
  dateNow: string,
  runMode: string,
  reportFile: string
): void {
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

  for (const r of results) {
    let statusClass = '';
    if (r.Status === '✅ Up to date' || r.Status === '✅ Up-to-date') {
      statusClass = 'status-up-to-date';
    } else if (r.Status === '⚠️ Update available') {
      statusClass = 'status-update';
    }

    let extraLink = '';
    if (
      r.SkidrowLink &&
      r.SkidrowLink.startsWith('https://www.skidrowreloaded.com/')
    ) {
      extraLink = ` <a href="${r.SkidrowLink}" target="_blank" title="SkidrowReloaded"><span style="font-size:1.2em;">&#128279;</span></a>`;
    }

    html += `<tr class="${statusClass}"><td>${r.Name}</td><td>${
      r.AppID
    }</td><td>${r.InstalledBuild ?? ''}</td><td>${
      r.LatestBuild ?? ''
    }</td><td>${r.LatestDate ?? ''}</td><td>${
      r.Status
    }${extraLink}</td></tr>\n`;
  }

  html += '</table>';
  html += `<p class="subtle">Report generated on ${dateNow} (${runMode})</p>`;
  html += '</body></html>';

  fs.writeFileSync(reportFile, html, 'utf-8');
}
