import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, InstallProgressEvent, ProviderId, ProviderProfile } from "../shared/types";

const api: DesktopApi = {
  system: {
    checkPrereqs: () => ipcRenderer.invoke("system.checkPrereqs"),
    getSettings: () => ipcRenderer.invoke("system.getSettings"),
    updateSettings: (settings) => ipcRenderer.invoke("system.updateSettings", settings)
  },
  install: {
    runBootstrap: (versionTag?: string) => ipcRenderer.invoke("install.runBootstrap", versionTag)
  },
  credentials: {
    verify: (provider: ProviderId, key: string) =>
      ipcRenderer.invoke("credentials.verify", provider, key),
    save: (provider: ProviderId, key: string) =>
      ipcRenderer.invoke("credentials.save", provider, key),
    remove: (provider: ProviderId) => ipcRenderer.invoke("credentials.remove", provider),
    listConfigured: () => ipcRenderer.invoke("credentials.listConfigured")
  },
  config: {
    applyProfile: (profile: ProviderProfile) => ipcRenderer.invoke("config.applyProfile", profile)
  },
  gateway: {
    start: () => ipcRenderer.invoke("gateway.start"),
    stop: () => ipcRenderer.invoke("gateway.stop"),
    status: () => ipcRenderer.invoke("gateway.status"),
    openDashboardWindow: () => ipcRenderer.invoke("gateway.openDashboardWindow")
  },
  diagnostics: {
    getLogs: (limit: number) => ipcRenderer.invoke("diagnostics.getLogs", limit),
    exportLogs: (targetPath: string) =>
      ipcRenderer.invoke("diagnostics.exportLogs", targetPath),
    healthCheckProviders: () => ipcRenderer.invoke("diagnostics.healthCheckProviders")
  },
  updates: {
    check: (channel?: "stable" | "beta") => ipcRenderer.invoke("updates.check", channel)
  }
};

contextBridge.exposeInMainWorld("openClawDesktop", api);

contextBridge.exposeInMainWorld("openClawEvents", {
  onInstallProgress: (callback: (event: InstallProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: InstallProgressEvent) => {
      callback(event);
    };
    ipcRenderer.on("install.progress", listener);
    return () => ipcRenderer.removeListener("install.progress", listener);
  },
  onNavigate: (callback: (tab: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tab: string) => callback(tab);
    ipcRenderer.on("app.navigate", listener);
    return () => ipcRenderer.removeListener("app.navigate", listener);
  },
  log: (message: string) => ipcRenderer.send("renderer.log", message)
});
