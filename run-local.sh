#!/bin/bash

# Example run script for local execution
# Update the paths below to match your environment

STEAMCMD_PATH="C:\steamcmd\steamcmd.sh"
REPO_PATH="$(pwd)"
BACKUP_DIR="D:\Games"
GIT_USER_NAME="FirebrawlX"
GIT_USER_EMAIL="andree.frank@gmail.com"

# Build the project
echo "Building project..."
npm run build

# Run the script
echo "Running Steam Backup Report..."
node dist/index.js \
  --SteamCmdPath "$STEAMCMD_PATH" \
  --RepoPath "$REPO_PATH" \
  --GitUserName "$GIT_USER_NAME" \
  --GitUserEmail "$GIT_USER_EMAIL" \
  --BackupDir "$BACKUP_DIR"
