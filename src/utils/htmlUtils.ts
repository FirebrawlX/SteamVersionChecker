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

function formatCountShort(count?: number): string {
  if (count == null) return '';
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return String(count);
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
 .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
.status-up-to-date { background-color: #c6efce; }
.status-update { background-color: #ffc7ce; }
.subtle { color: #666; font-size: 0.9em; }
th { background-color: #eee; }
.name-link { color: inherit; text-decoration: none; display: block; width: 100%; height: 100%; }
th.sortable { cursor: pointer; user-select: none; }
th.sortable[data-dir="asc"]::after { content: " ▲"; }
th.sortable[data-dir="desc"]::after { content: " ▼"; }
td.num { text-align: left; font-variant-numeric: tabular-nums; }
td.status-cell { width: 1%; white-space: nowrap; }
td.rating-cell { white-space: nowrap; }
@media (max-width: 600px) {
  body { padding: 12px; }
  th, td { padding: 6px; }
}
</style>
<script>
function svcsGetCellSortValue(cell) {
  if (!cell) return '';
  const attr = cell.getAttribute('data-sort');
  if (attr != null) return attr;
  return (cell.textContent || '').trim();
}

function svcsCompare(a, b, type, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  if (type === 'num') {
    const na = a === '' ? Number.NaN : Number(a);
    const nb = b === '' ? Number.NaN : Number(b);
    const aIsNaN = Number.isNaN(na);
    const bIsNaN = Number.isNaN(nb);
    if (aIsNaN && bIsNaN) return 0;
    if (aIsNaN) return 1; // blanks last
    if (bIsNaN) return -1;
    if (na < nb) return -1 * mult;
    if (na > nb) return 1 * mult;
    return 0;
  }

  // default: string compare (case-insensitive)
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  if (sa < sb) return -1 * mult;
  if (sa > sb) return 1 * mult;
  return 0;
}

function svcsSortTableByKey(table, key, type, dir) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const keyed = rows.map((row, idx) => {
    const cell = row.querySelector('[data-key="' + key + '"]');
    return { row, idx, value: svcsGetCellSortValue(cell) };
  });

  keyed.sort((ra, rb) => {
    const cmp = svcsCompare(ra.value, rb.value, type, dir);
    if (cmp !== 0) return cmp;
    return ra.idx - rb.idx; // stable
  });

  for (const item of keyed) tbody.appendChild(item.row);
}

function svcsInitSorting() {
  const table = document.getElementById('reportTable');
  if (!table) return;

  const headers = Array.from(table.querySelectorAll('th.sortable'));
  headers.forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-key');
      const type = th.getAttribute('data-sort-type') || 'str';
      if (!key) return;

      // Toggle direction on same header, otherwise default asc
      const current = th.getAttribute('data-dir');
      const nextDir = current === 'asc' ? 'desc' : 'asc';

      headers.forEach((h) => h.removeAttribute('data-dir'));
      th.setAttribute('data-dir', nextDir);

      svcsSortTableByKey(table, key, type, nextDir);
    });
  });
}

document.addEventListener('DOMContentLoaded', svcsInitSorting);
</script>
</head>
<body>
<h1>Steam Backup Report</h1>
<div class="table-wrap">
<table id="reportTable">
<thead>
<tr>
  <th class="sortable" data-sort-key="name" data-sort-type="str">Name</th>
  <th class="sortable" data-sort-key="appid" data-sort-type="num">AppID</th>
  <th class="sortable" data-sort-key="installed" data-sort-type="num">Installed Build</th>
  <th class="sortable" data-sort-key="latest" data-sort-type="num">Latest Build</th>
  <th class="sortable" data-sort-key="updated" data-sort-type="str">Latest Build Updated</th>
  <th class="sortable" data-sort-key="rating" data-sort-type="num">Rating</th>
  <th class="sortable" data-sort-key="status" data-sort-type="str">Status</th>
</tr>
</thead>
<tbody>
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

    const statusText = r.Status ?? '';
    const statusIcon = statusText.split(' ')[0] || '';

    html += `<tr class="${statusClass}">`;
    html += `<td data-key="name" data-sort="${r.Name}"><a class="name-link" href="${nameLink}">${r.Name}</a></td>`;
    html += `<td class="num" data-key="appid" data-sort="${r.AppID}">${r.AppID}</td>`;
    html += `<td class="num" data-key="installed" data-sort="${
      r.InstalledBuild ?? ''
    }">${r.InstalledBuild ?? ''}</td>`;
    html += `<td class="num" data-key="latest" data-sort="${
      r.LatestBuild ?? ''
    }">${r.LatestBuild ?? ''}</td>`;
    html += `<td data-key="updated" data-sort="${formattedDate}">${formattedDate}</td>`;
    const pct =
      typeof r.RatingPercent === 'number' && Number.isFinite(r.RatingPercent)
        ? r.RatingPercent
        : undefined;
    const pctText = pct == null ? '' : `${pct.toFixed(2)}%`;
    const summary = r.ReviewSummary ?? '';
    const reviewsShort = formatCountShort(r.ReviewsTotal);
    const reviewsText = reviewsShort ? `${reviewsShort} reviews` : '';

    const tooltipParts: string[] = [];
    if (summary) tooltipParts.push(summary);
    if (pctText) tooltipParts.push(pctText);
    if (typeof r.ReviewsTotal === 'number')
      tooltipParts.push(`${r.ReviewsTotal} total reviews`);
    if (typeof r.ReviewsPositive === 'number')
      tooltipParts.push(`${r.ReviewsPositive} positive`);
    if (typeof r.ReviewsNegative === 'number')
      tooltipParts.push(`${r.ReviewsNegative} negative`);
    const ratingTooltip = tooltipParts.join('\n');

    html += `<td class="num rating-cell" data-key="rating" data-sort="${
      pct ?? ''
    }" title="${ratingTooltip}">`;
    if (pctText) {
      html += `${pctText}${reviewsText ? ' (' + reviewsText : ')'}`;
    }
    html += `</td>`;
    html += `<td class="status-cell" data-key="status" data-sort="${statusText}" title="${statusText}">${statusIcon}</td>`;
    html += `</tr>\n`;
  }

  html += '</tbody></table></div>';
  html += `<p class="subtle">Report generated on ${dateNow} (${runMode})</p>`;
  html += '</body></html>';

  fs.writeFileSync(reportFile, html, 'utf-8');
}
