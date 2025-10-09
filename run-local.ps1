# Example run script for local execution (Windows PowerShell)

$STEAMCMD_PATH = "C:\steamcmd\steamcmd.exe"
$REPO_PATH = (Get-Location).Path
$BACKUP_DIR = "D:\Games"
$GIT_USER_NAME = "FirebrawlX"
$GIT_USER_EMAIL = "andree.frank@gmail.com"

Write-Host "Building project..."
npm run build

Write-Host "Running Steam Backup Report..."
node dist/index.js `
  --SteamCmdPath "$STEAMCMD_PATH" `
  --RepoPath "$REPO_PATH" `
  --GitUserName "$GIT_USER_NAME" `
  --GitUserEmail "$GIT_USER_EMAIL" `
  --BackupDir "$BACKUP_DIR"
