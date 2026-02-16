import log from "electron-log/main";
import { getLogFilePath } from "./pathResolver";

let initialized = false;

export function initLogger(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  log.initialize();
  log.transports.file.resolvePathFn = () => getLogFilePath();
  log.transports.file.level = "info";
  log.transports.console.level = "info";
}

export const logger = log;
