# OpenClaw Desktop for Windows

## What this app does
`OpenClaw Desktop` is an Electron `.exe` shell that runs OpenClaw on WSL2 Ubuntu and embeds the OpenClaw dashboard inside a desktop window.

## Prerequisites
1. Windows 10/11 with WSL2 enabled.
2. Ubuntu distro installed in WSL.
3. Internet access.
4. Git and Node.js on Windows.

## First run
1. Launch `OpenClaw Desktop`.
2. Open the `Setup` tab.
3. Run `Preflight checks` and fix any failing items.
4. In `Install OpenClaw`, optionally enter a version tag (or use pinned `state/version.lock`) and click `Run Bootstrap`.
5. Add API keys and use `Verify + Save` for:
- DeepSeek
- OpenAI
- Anthropic
- Perplexity (web search)
6. In `Finalize`, select default model and click `Apply Profile + Start Gateway`.

## Daily use
1. Open `Dashboard` tab.
2. Click `Start` to launch gateway if not already running.
3. Use the embedded dashboard directly in the app window.

## Settings
Use `Settings` tab to control:
1. Auto-start gateway on app launch.
2. Start app with Windows.
3. Perplexity search toggle.
4. Release channel (`stable` or `beta`) for update checks.
5. Manual update check.

## Diagnostics
Use `Diagnostics` tab to:
1. Check provider health.
2. View logs.
3. Export logs to a local file path.

## Packaging
From `app/`:
```powershell
npm install
npm run dist
```

Artifacts are generated in `app/release/`:
1. NSIS installer `.exe`
2. Portable `.exe`

## GitHub release wiring
The desktop app is wired to:
1. Repository: `https://github.com/mahmoodmsaad/open_claw_gui`
2. Update source: GitHub Releases (`stable` = latest release, `beta` = latest prerelease if available)

## Notes
1. v1 uses unsigned builds, so SmartScreen warnings are expected on first run.
2. API keys are stored in Windows Credential Manager and synced to WSL runtime `.env` when profile is applied.
