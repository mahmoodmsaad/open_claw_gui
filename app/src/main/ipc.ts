import { BrowserWindow, ipcMain } from "electron";
import type { AppSettings, ProviderId, ProviderProfile } from "../shared/types";
import { ConfigService } from "./services/configService";
import { CredentialService } from "./services/credentialService";
import { DiagnosticsService } from "./services/diagnosticsService";
import { GatewayService } from "./services/gatewayService";
import { InstallService } from "./services/installService";
import { PrereqService } from "./services/prereqService";
import { SettingsStore } from "./services/settingsStore";
import { UpdateService } from "./services/updateService";

type IpcDeps = {
  getMainWindow: () => BrowserWindow | null;
  openDashboardWindow: () => Promise<{ ok: boolean; message: string }>;
  onSettingsUpdated?: (
    nextSettings: AppSettings,
    patch: Record<string, unknown>
  ) => Promise<void>;
  prereqs: PrereqService;
  install: InstallService;
  credentials: CredentialService;
  config: ConfigService;
  gateway: GatewayService;
  diagnostics: DiagnosticsService;
  settingsStore: SettingsStore;
  updates: UpdateService;
};

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle("system.checkPrereqs", async () => deps.prereqs.checkPrereqs());
  ipcMain.handle("system.getSettings", async () => deps.settingsStore.getSettings());
  ipcMain.handle("system.updateSettings", async (_event, patch) => {
    const next = await deps.settingsStore.updateSettings(patch);
    if (deps.onSettingsUpdated) {
      await deps.onSettingsUpdated(next, patch);
    }
    return next;
  });

  ipcMain.handle("install.runBootstrap", async (_event, versionTag?: string) =>
    deps.install.runBootstrap(versionTag, (progressEvent) => {
      deps.getMainWindow()?.webContents.send("install.progress", progressEvent);
    })
  );

  ipcMain.handle(
    "credentials.verify",
    async (_event, provider: ProviderId, key: string) => deps.credentials.verify(provider, key)
  );
  ipcMain.handle(
    "credentials.save",
    async (_event, provider: ProviderId, key: string) => deps.credentials.save(provider, key)
  );
  ipcMain.handle("credentials.remove", async (_event, provider: ProviderId) =>
    deps.credentials.remove(provider)
  );
  ipcMain.handle("credentials.listConfigured", async () => deps.credentials.listConfigured());

  ipcMain.handle("config.applyProfile", async (_event, profile: ProviderProfile) =>
    deps.config.applyProfile(profile)
  );

  ipcMain.handle("gateway.start", async () => deps.gateway.start());
  ipcMain.handle("gateway.stop", async () => deps.gateway.stop());
  ipcMain.handle("gateway.status", async () => deps.gateway.status());
  ipcMain.handle("gateway.openDashboardWindow", async () => deps.openDashboardWindow());

  ipcMain.handle("diagnostics.getLogs", async (_event, limit: number) =>
    deps.diagnostics.getLogs(limit)
  );
  ipcMain.handle("diagnostics.exportLogs", async (_event, targetPath: string) =>
    deps.diagnostics.exportLogs(targetPath)
  );
  ipcMain.handle("diagnostics.healthCheckProviders", async () =>
    deps.diagnostics.healthCheckProviders()
  );

  ipcMain.handle("updates.check", async (_event, channel?: "stable" | "beta") =>
    deps.updates.check(channel)
  );
}
