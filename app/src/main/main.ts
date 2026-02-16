import path from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  shell
} from "electron";
import { registerIpcHandlers } from "./ipc";
import { ConfigService } from "./services/configService";
import { CredentialService } from "./services/credentialService";
import { DiagnosticsService } from "./services/diagnosticsService";
import { GatewayService } from "./services/gatewayService";
import { InstallService } from "./services/installService";
import { initLogger, logger } from "./services/logger";
import { PrereqService } from "./services/prereqService";
import { ProviderSupervisor } from "./services/providerSupervisor";
import { SettingsStore } from "./services/settingsStore";
import { UpdateService } from "./services/updateService";
import { WslService } from "./services/wslService";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let providerSupervisor: ProviderSupervisor | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function preloadPath(): string {
  return path.join(__dirname, "../preload/index.js");
}

function rendererIndexPath(): string {
  return path.join(__dirname, "../renderer/index.html");
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    title: "OpenClaw Desktop",
    show: true,
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    logger.error(
      `Renderer failed to load: code=${errorCode}, description=${errorDescription}, url=${validatedUrl}`
    );
    const html = `
      <html>
        <body style="font-family:Segoe UI,sans-serif;background:#0f1624;color:#f8d7da;padding:16px;">
          <h2>OpenClaw Desktop failed to load UI</h2>
          <p>Error code: ${errorCode}</p>
          <p>Error: ${errorDescription}</p>
          <p>URL: ${validatedUrl}</p>
        </body>
      </html>
    `;
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    logger.error(`Renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  if (isDev) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadFile(rendererIndexPath());
  }

  return window;
}

function createTray(onNavigate: (tab: string) => void, gateway: GatewayService): Tray {
  const icon = nativeImage.createFromPath(process.execPath);
  const trayInstance = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  trayInstance.setToolTip("OpenClaw Desktop");

  const buildMenu = (): Menu => {
    return Menu.buildFromTemplate([
      {
        label: "Open Dashboard",
        click: () => onNavigate("dashboard")
      },
      {
        label: "Open Settings",
        click: () => onNavigate("settings")
      },
      { type: "separator" },
      {
        label: "Start Gateway",
        click: () => {
          void gateway.start().then(() => onNavigate("dashboard"));
        }
      },
      {
        label: "Stop Gateway",
        click: () => {
          void gateway.stop();
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
  };

  trayInstance.setContextMenu(buildMenu());
  trayInstance.on("double-click", () => onNavigate("dashboard"));
  return trayInstance;
}

function navigateToTab(tab: string): void {
  if (!mainWindow) {
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("app.navigate", tab);
}

function setWindowsStartup(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: ["--hidden"]
  });
}

function notify(message: string): void {
  if (Notification.isSupported()) {
    new Notification({
      title: "OpenClaw Desktop",
      body: message
    }).show();
  }
}

async function bootstrap(): Promise<void> {
  initLogger();
  logger.info("Bootstrapping OpenClaw Desktop");

  const settingsStore = new SettingsStore();
  const wslService = new WslService();
  const prereqs = new PrereqService(wslService);
  const install = new InstallService(wslService);
  const credentials = new CredentialService();
  const config = new ConfigService(credentials, wslService);
  const gateway = new GatewayService(wslService);
  const diagnostics = new DiagnosticsService(credentials);
  const updates = new UpdateService();

  mainWindow = await createMainWindow();
  tray = createTray(navigateToTab, gateway);

  registerIpcHandlers({
    getMainWindow: () => mainWindow,
    openDashboardWindow: async () => {
      navigateToTab("dashboard");
      return {
        ok: true,
        message: "Dashboard tab opened."
      };
    },
    onSettingsUpdated: async (nextSettings, patch) => {
      if (typeof patch.startWithWindows === "boolean") {
        setWindowsStartup(patch.startWithWindows);
      }
      providerSupervisor?.updateSettings(nextSettings);
    },
    prereqs,
    install,
    credentials,
    config,
    gateway,
    diagnostics,
    settingsStore,
    updates
  });

  ipcMain.on("renderer.log", (_event, message: string) => {
    logger.info(`[renderer] ${message}`);
  });

  const settings = await settingsStore.getSettings();
  setWindowsStartup(settings.startWithWindows);

  providerSupervisor = new ProviderSupervisor(
    credentials,
    diagnostics,
    config,
    gateway,
    (message) => {
      notify(message);
      logger.warn(message);
      navigateToTab("dashboard");
    }
  );
  await providerSupervisor.initialize(settings);

  if (settings.gatewayAutoStart) {
    const gatewayStatus = await gateway.start();
    if (gatewayStatus.running) {
      logger.info("Gateway auto-started successfully.");
    } else if (gatewayStatus.error) {
      logger.warn(`Gateway auto-start failed: ${gatewayStatus.error}`);
    }
  }

  if (process.argv.includes("--hidden")) {
    mainWindow.hide();
  }
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    navigateToTab("dashboard");
  });

  app.whenReady().then(() => {
    void bootstrap();
  });

  app.on("window-all-closed", () => {
    // Keep app running in tray on Windows.
  });

  app.on("activate", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.show();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    providerSupervisor?.stop();
    tray?.destroy();
    tray = null;
  });
}
