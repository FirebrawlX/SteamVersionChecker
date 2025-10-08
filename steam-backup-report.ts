// --- Main Logic ---
export async function main(params: Params) {
  console.log('Starting Steam Backup Report...');
  const isActions = isGitHubActions();
  console.log('GitHub Actions mode:', isActions);
  const reportFile = getReportFile(params.RepoPath);
  const dataFile = getDataFile(params.RepoPath);

  let gamesData = readGamesData(dataFile);
  console.log('Loaded gamesData keys:', Object.keys(gamesData));
  let gamesToCheck: GameData[] = [];

  if (isActions) {
    gamesToCheck = Object.values(gamesData);
    console.log('Games to check from games.json:', gamesToCheck.length);
  } else {
    const localBackups = getLocalBackups(params.BackupDir);
    console.log('Local backups found:', localBackups.length);
    for (const g of localBackups) {
      if (gamesData[g.AppID]) {
        gamesData[g.AppID].Name = g.Name;
        gamesData[g.AppID].InstalledBuild = g.InstalledBuild;
      } else {
        gamesData[g.AppID] = g;
      }
    }
    writeGamesData(dataFile, gamesData);
    gamesToCheck = localBackups;
    console.log('Games to check after merging:', gamesToCheck.length);
  }

  const results: GameData[] = [];
  for (const game of gamesToCheck) {
    console.log(`Processing game: ${game.Name} (AppID: ${game.AppID})`);
    const latestInfo = getLatestBuild(game.AppID, params.SteamCmdPath);
    console.log(`SteamCMD result for ${game.Name}:`, latestInfo);
    const latestBuild = latestInfo.BuildID;
    const latestTimeUpdated = latestInfo.TimeUpdated;
    let latestDate = '';
    const prevBuild = gamesData[game.AppID]?.LatestBuild;
    const prevDate = gamesData[game.AppID]?.LatestDate;
    if (latestTimeUpdated) {
      latestDate = new Date(latestTimeUpdated * 1000).toISOString();
      gamesData[game.AppID].LatestDate = latestDate;
    } else if ((latestBuild !== prevBuild) || !prevDate) {
      latestDate = new Date().toISOString();
      gamesData[game.AppID].LatestDate = latestDate;
    } else {
      latestDate = prevDate ?? '';
    }
    gamesData[game.AppID].LatestBuild = latestBuild === null ? undefined : latestBuild;
    // SkidrowReloaded link
    const sinceDate = latestDate ? new Date(latestDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    let skidrowLink = '';
    try {
      const links = await getSkidrowLinks(game.Name, sinceDate);
      console.log(`Skidrow links for ${game.Name}:`, links);
      if (links.length > 0) {
        skidrowLink = links[0];
        gamesData[game.AppID].SkidrowLink = skidrowLink;
      } else if (gamesData[game.AppID].SkidrowLink) {
        skidrowLink = gamesData[game.AppID].SkidrowLink ?? '';
      }
    } catch (err) {
      console.log(`Error fetching Skidrow links for ${game.Name}:`, err);
      if (gamesData[game.AppID].SkidrowLink) {
        skidrowLink = gamesData[game.AppID].SkidrowLink ?? '';
      }
    }
    // Status
    let status = '';
    if (latestBuild == null) {
      status = '❌ Could not fetch latest';
    } else if (latestBuild > (game.InstalledBuild ?? 0)) {
      status = '⚠️ Update available';
    } else {
      status = '✅ Up to date';
    }
    results.push({
      Name: game.Name,
      AppID: game.AppID,
      InstalledBuild: game.InstalledBuild,
      LatestBuild: latestBuild === null ? undefined : latestBuild,
      LatestDate: latestDate,
      Status: status,
      SkidrowLink: skidrowLink
    });
  }
  console.log('Results:', results);
  writeGamesData(dataFile, gamesData);
  console.log('games.json updated.');
  // Stockholm time
  const dateNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour12: false }).replace(' ', 'T');
  const runMode = isActions ? 'GitHub Actions' : 'Local run';
  generateHtmlReport(results, dateNow, runMode, reportFile);
  console.log('HTML report generated:', reportFile);
  // Git commit/push
  if (process.env.GITHUB_TOKEN || !isActions) {
    try {
      execSync(`git -C ${params.RepoPath} config user.name "${params.GitUserName}"`);
      execSync(`git -C ${params.RepoPath} config user.email "${params.GitUserEmail}"`);
      execSync(`git -C ${params.RepoPath} add index.html games.json`);
      execSync(`git -C ${params.RepoPath} commit -m "Update Steam backup report ${dateNow}" -a`);
      execSync(`git -C ${params.RepoPath} pull --strategy=ours`);
      execSync(`git -C ${params.RepoPath} push`);
      console.log('Git commit and push completed.');
    } catch (err) {
      console.log('Git commit/push error:', err);
    }
  }
  console.log('Steam Backup Report finished.');
}
