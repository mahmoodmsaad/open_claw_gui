# OpenClaw Desktop Workspace

This repository contains a Windows-focused desktop shell for OpenClaw.

## Layout
1. `app/`: Electron + React desktop app source.
2. `docs/windows-user-guide.md`: end-user setup and usage guide.
3. `state/version.lock`: pinned OpenClaw upstream version used by bootstrap.

## Development
```powershell
cd app
npm install
npm run dev
```

## Build
```powershell
cd app
npm run dist
```

Build artifacts are written to `app/release/`.

## Release wiring
1. GitHub repo URL: `https://github.com/mahmoodmsaad/open_claw_gui`
2. Stable updates: latest release
3. Beta updates: latest prerelease when available
