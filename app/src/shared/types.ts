export type ProviderId = "deepseek" | "openai" | "anthropic" | "perplexity";

export type ProviderHealth = {
  provider: ProviderId;
  ok: boolean;
  latencyMs: number;
  message?: string;
};

export type GatewayStatus = {
  running: boolean;
  url?: string;
  pid?: number;
  error?: string;
};

export type PrereqStatus = {
  ok: boolean;
  platform: string;
  checks: Array<{
    id: "windows" | "wsl" | "ubuntu" | "openclaw" | "internet" | "git";
    ok: boolean;
    detail: string;
  }>;
};

export type InstallProgressEvent = {
  step:
    | "preflight"
    | "clone"
    | "checkout"
    | "install"
    | "configure"
    | "done";
  message: string;
  ok: boolean;
  timestamp: string;
};

export type VerifyResult = {
  ok: boolean;
  canSkip: boolean;
  provider: ProviderId;
  statusCode?: number;
  latencyMs: number;
  message: string;
};

export type SaveResult = {
  ok: boolean;
  message: string;
};

export type ApplyResult = {
  ok: boolean;
  message: string;
};

export type ExportResult = {
  ok: boolean;
  message: string;
  path?: string;
};

export type UpdateInfo = {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  message: string;
};

export type AppSettings = {
  gatewayAutoStart: boolean;
  startWithWindows: boolean;
  searchEnabled: boolean;
  releaseChannel: "stable" | "beta";
};

export type OpenClawConfigPatch = {
  defaultModel: string;
  providers: Record<string, unknown>;
  tools: Record<string, unknown>;
};

export type ProviderProfile = {
  enabledProviders: ProviderId[];
  defaultModel: string;
  searchEnabled: boolean;
  fallbackChain: ProviderId[];
};

export type DesktopApi = {
  system: {
    checkPrereqs: () => Promise<PrereqStatus>;
    getSettings: () => Promise<AppSettings>;
    updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  };
  install: {
    runBootstrap: (versionTag?: string) => Promise<InstallProgressEvent[]>;
  };
  credentials: {
    verify: (provider: ProviderId, key: string) => Promise<VerifyResult>;
    save: (provider: ProviderId, key: string) => Promise<SaveResult>;
    remove: (provider: ProviderId) => Promise<SaveResult>;
    listConfigured: () => Promise<ProviderId[]>;
  };
  config: {
    applyProfile: (profile: ProviderProfile) => Promise<ApplyResult>;
  };
  gateway: {
    start: () => Promise<GatewayStatus>;
    stop: () => Promise<GatewayStatus>;
    status: () => Promise<GatewayStatus>;
    openDashboardWindow: () => Promise<{ ok: boolean; message: string }>;
  };
  diagnostics: {
    getLogs: (limit: number) => Promise<string[]>;
    exportLogs: (targetPath: string) => Promise<ExportResult>;
    healthCheckProviders: () => Promise<ProviderHealth[]>;
  };
  updates: {
    check: (channel?: "stable" | "beta") => Promise<UpdateInfo>;
  };
};

declare global {
  interface Window {
    openClawDesktop: DesktopApi;
    openClawEvents: {
      onInstallProgress: (callback: (event: InstallProgressEvent) => void) => () => void;
      onNavigate: (callback: (tab: string) => void) => () => void;
      log: (message: string) => void;
    };
  }
}
