# Steam Version Checker

A Node.js/TypeScript application that checks local Steam backup versions and polls Steam for updates. Supports both local execution and GitHub Actions polling.

## Features

- 📦 Scans local Steam backup `.7z` files
- 🔍 Fetches latest build information from Steam using SteamCMD
- 📡 Monitors for updates via GitHub Actions
- 🔗 Searches SkidrowReloaded RSS feed for game links
- 📊 Generates HTML report with game status
- 🚀 Automatically commits and pushes updates to GitHub Pages

## Project Structure

```
SteamVersionChecker/
├── src/                      # TypeScript source files
│   ├── index.ts             # Main entry point
│   ├── types.ts             # Type definitions
│   └── utils/               # Utility modules
│       ├── fileUtils.ts     # File system operations
│       ├── steamUtils.ts    # Steam API integration
│       ├── rssUtils.ts      # RSS feed parsing
│       └── htmlUtils.ts     # HTML report generation
├── dist/                     # Compiled JavaScript (generated)
├── games.json               # Game data storage
├── index.html               # Generated HTML report
├── package.json             # Node.js dependencies
├── tsconfig.json            # TypeScript configuration
└── Check-SteamBackups.ps1   # Legacy PowerShell script
```

## Prerequisites

- Node.js (v16 or higher)
- npm
- SteamCMD installed and accessible

## Installation

1. Clone the repository:

```bash
git clone https://github.com/FirebrawlX/SteamVersionChecker.git
cd SteamVersionChecker
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Usage

### Local Execution

Run the script locally to scan backup files:

```bash
node dist/index.js \
  --SteamCmdPath "/path/to/steamcmd" \
  --RepoPath "/path/to/repo" \
  --GitUserName "Your Name" \
  --GitUserEmail "your@email.com" \
  --BackupDir "/path/to/backups"
```

**Parameters:**

- `--SteamCmdPath` (required): Path to steamcmd executable
- `--RepoPath` (required): Path to the repository
- `--GitUserName` (required): Git username for commits
- `--GitUserEmail` (required): Git email for commits
- `--BackupDir` (optional): Directory containing `.7z` backup files (default: current directory)

### GitHub Actions

The script automatically detects GitHub Actions environment and runs in polling mode, checking all games in `games.json` instead of scanning local files.

## Backup File Naming Convention

Local backup files must follow this naming pattern:

```
GameName_AppID_BuildID.7z
```

Example:

```
Half.Life.2_220_12345678.7z
```

## Output

### games.json

Stores game data including:

- Game name
- Steam AppID
- Installed build ID
- Latest build ID
- Last update date
- SkidrowReloaded link (if available)

### index.html

HTML report with:

- Game name and AppID
- Installed vs Latest build comparison
- Update status (✅ Up to date / ⚠️ Update available / ❌ Error)
- SkidrowReloaded links (if available)
- Report generation timestamp

## Development

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run clean` - Remove compiled files
- `npm start` - Run the compiled application

### Project Architecture

The codebase is organized into modules:

- **types.ts**: TypeScript interfaces and type definitions
- **fileUtils.ts**: File I/O, JSON parsing, backup scanning
- **steamUtils.ts**: SteamCMD integration and build info fetching
- **rssUtils.ts**: RSS feed parsing for SkidrowReloaded
- **htmlUtils.ts**: HTML report generation
- **index.ts**: Main application logic and CLI argument parsing

## License

MIT
