import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export function ensureDirectory(directoryPath: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

export function getWorkspaceRootPath(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(app.getAppPath(), "..");
}

export function getPresetFilePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "provider-presets.json");
  }
  return path.join(app.getAppPath(), "resources", "provider-presets.json");
}

export function getVersionLockPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "version.lock");
  }
  return path.join(getWorkspaceRootPath(), "state", "version.lock");
}

export function getSettingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function getLogFilePath(): string {
  const logDir = path.join(app.getPath("userData"), "logs");
  ensureDirectory(logDir);
  return path.join(logDir, "openclaw-desktop.log");
}

export function getLogsDirectoryPath(): string {
  const logDir = path.join(app.getPath("userData"), "logs");
  ensureDirectory(logDir);
  return logDir;
}
