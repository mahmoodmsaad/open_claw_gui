import { useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  GatewayStatus,
  InstallProgressEvent,
  ProviderHealth,
  ProviderId,
  PrereqStatus,
  UpdateInfo,
  VerifyResult
} from "@shared/types";

type TabId = "setup" | "dashboard" | "settings" | "diagnostics";

const PROVIDERS: ProviderId[] = ["deepseek", "openai", "anthropic", "perplexity"];
const DEFAULT_FALLBACK: ProviderId[] = ["deepseek", "openai", "anthropic"];

const PROVIDER_LABEL: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
  perplexity: "Perplexity"
};

const MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-haiku-latest",
  perplexity: "sonar"
};

type KeyInputs = Record<ProviderId, string>;
type VerifyState = Record<ProviderId, VerifyResult | undefined>;

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const [prereqs, setPrereqs] = useState<PrereqStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<ProviderId[]>([]);
  const [gateway, setGateway] = useState<GatewayStatus>({ running: false });
  const [installHistory, setInstallHistory] = useState<InstallProgressEvent[]>([]);
  const [installRunning, setInstallRunning] = useState(false);
  const [versionTagInput, setVersionTagInput] = useState("");
  const [keys, setKeys] = useState<KeyInputs>({
    deepseek: "",
    openai: "",
    anthropic: "",
    perplexity: ""
  });
  const [verifyState, setVerifyState] = useState<VerifyState>({
    deepseek: undefined,
    openai: undefined,
    anthropic: undefined,
    perplexity: undefined
  });
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [logs, setLogs] = useState<string[]>([]);
  const [exportPath, setExportPath] = useState("");
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [defaultModel, setDefaultModel] = useState("deepseek-chat");

  const openClawInstalled = useMemo(
    () => prereqs?.checks.some((check) => check.id === "openclaw" && check.ok) ?? false,
    [prereqs]
  );
  const setupComplete = useMemo(
    () => configuredProviders.length > 0 && openClawInstalled,
    [configuredProviders, openClawInstalled]
  );

  useEffect(() => {
    void refreshAll();
    const unsubscribeProgress = window.openClawEvents?.onInstallProgress((event) => {
      setInstallHistory((previous) => [...previous, event]);
    });
    const unsubscribeNavigate = window.openClawEvents?.onNavigate((tab) => {
      if (tab === "setup" || tab === "dashboard" || tab === "settings" || tab === "diagnostics") {
        setActiveTab(tab);
      }
    });
    return () => {
      unsubscribeProgress?.();
      unsubscribeNavigate?.();
    };
  }, []);

  useEffect(() => {
    if (setupComplete && activeTab === "setup") {
      setActiveTab("dashboard");
    }
  }, [setupComplete, activeTab]);

  async function refreshAll(): Promise<void> {
    await Promise.all([
      refreshPrereqs(),
      refreshSettings(),
      refreshConfiguredProviders(),
      refreshGateway(),
      refreshDiagnostics()
    ]);
  }

  async function refreshPrereqs(): Promise<void> {
    const status = await window.openClawDesktop.system.checkPrereqs();
    setPrereqs(status);
  }

  async function refreshSettings(): Promise<void> {
    const nextSettings = await window.openClawDesktop.system.getSettings();
    setSettings(nextSettings);
  }

  async function refreshConfiguredProviders(): Promise<void> {
    const providers = await window.openClawDesktop.credentials.listConfigured();
    setConfiguredProviders(providers);
    if (providers.length > 0) {
      const first = providers.find((provider) => provider !== "perplexity");
      if (first) {
        setDefaultModel(MODEL_BY_PROVIDER[first]);
      }
    }
  }

  async function refreshGateway(): Promise<void> {
    const status = await window.openClawDesktop.gateway.status();
    setGateway(status);
  }

  async function refreshDiagnostics(): Promise<void> {
    const [lines, providerHealth] = await Promise.all([
      window.openClawDesktop.diagnostics.getLogs(200),
      window.openClawDesktop.diagnostics.healthCheckProviders()
    ]);
    setLogs(lines);
    setHealth(providerHealth);
  }

  async function handleBootstrap(): Promise<void> {
    setInstallRunning(true);
    setStatusMessage("Starting OpenClaw bootstrap in WSL2...");
    setInstallHistory([]);
    try {
      const events = await window.openClawDesktop.install.runBootstrap(
        versionTagInput.trim() || undefined
      );
      setInstallHistory(events);
      setStatusMessage("Bootstrap completed.");
      await Promise.all([refreshPrereqs(), refreshGateway()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bootstrap failed.";
      setStatusMessage(message);
    } finally {
      setInstallRunning(false);
    }
  }

  async function handleVerifyAndSave(provider: ProviderId): Promise<void> {
    const key = keys[provider]?.trim();
    if (!key) {
      setStatusMessage(`${PROVIDER_LABEL[provider]} key is empty.`);
      return;
    }

    setStatusMessage(`Verifying ${PROVIDER_LABEL[provider]} key...`);
    const result = await window.openClawDesktop.credentials.verify(provider, key);
    setVerifyState((previous) => ({
      ...previous,
      [provider]: result
    }));

    if (!result.ok && !result.canSkip) {
      setStatusMessage(result.message);
      return;
    }

    if (!result.ok && result.canSkip) {
      const proceed = window.confirm(
        `${PROVIDER_LABEL[provider]} verification could not complete (${result.message}). Save key anyway?`
      );
      if (!proceed) {
        return;
      }
    }

    const saveResult = await window.openClawDesktop.credentials.save(provider, key);
    setStatusMessage(saveResult.message);
    await refreshConfiguredProviders();
    await refreshDiagnostics();
  }

  async function handleRemoveKey(provider: ProviderId): Promise<void> {
    const result = await window.openClawDesktop.credentials.remove(provider);
    setStatusMessage(result.message);
    setVerifyState((previous) => ({
      ...previous,
      [provider]: undefined
    }));
    setKeys((previous) => ({
      ...previous,
      [provider]: ""
    }));
    await refreshConfiguredProviders();
    await refreshDiagnostics();
  }

  async function handleFinalizeSetup(): Promise<void> {
    if (!settings) {
      return;
    }
    if (!openClawInstalled) {
      setStatusMessage("OpenClaw CLI is not installed in WSL. Run Step 2 first.");
      setActiveTab("setup");
      return;
    }
    const enabledProviders = configuredProviders;
    const result = await window.openClawDesktop.config.applyProfile({
      enabledProviders,
      defaultModel,
      fallbackChain: DEFAULT_FALLBACK,
      searchEnabled: settings.searchEnabled
    });

    setStatusMessage(result.message);
    if (!result.ok) {
      return;
    }

    const started = await window.openClawDesktop.gateway.start();
    setGateway(started);
    setActiveTab("dashboard");
  }

  async function handleGatewayStart(): Promise<void> {
    setStatusMessage("Starting gateway...");
    const status = await window.openClawDesktop.gateway.start();
    setGateway(status);
    setStatusMessage(status.running ? "Gateway started." : status.error ?? "Gateway did not start.");
  }

  async function handleGatewayStop(): Promise<void> {
    setStatusMessage("Stopping gateway...");
    const status = await window.openClawDesktop.gateway.stop();
    setGateway(status);
    setStatusMessage("Gateway stopped.");
  }

  async function handleSettingsPatch(patch: Partial<AppSettings>): Promise<void> {
    const next = await window.openClawDesktop.system.updateSettings(patch);
    setSettings(next);
    if (typeof patch.searchEnabled === "boolean" && configuredProviders.length > 0) {
      await window.openClawDesktop.config.applyProfile({
        enabledProviders: configuredProviders,
        defaultModel,
        fallbackChain: DEFAULT_FALLBACK,
        searchEnabled: next.searchEnabled
      });
    }
    setStatusMessage("Settings updated.");
  }

  async function handleUpdateCheck(): Promise<void> {
    setStatusMessage("Checking for updates...");
    const info = await window.openClawDesktop.updates.check(settings?.releaseChannel ?? "stable");
    setUpdateInfo(info);
    setStatusMessage(info.message);
  }

  async function handleExportLogs(): Promise<void> {
    if (!exportPath.trim()) {
      setStatusMessage("Enter an export path.");
      return;
    }
    const result = await window.openClawDesktop.diagnostics.exportLogs(exportPath.trim());
    setStatusMessage(result.message);
  }

  function providerStateText(provider: ProviderId): string {
    if (configuredProviders.includes(provider)) {
      return "Configured";
    }
    return "Not set";
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">OpenClaw Desktop</div>
        <nav className="tabs">
          <button
            className={activeTab === "setup" ? "tab active" : "tab"}
            onClick={() => setActiveTab("setup")}
          >
            Setup
          </button>
          <button
            className={activeTab === "dashboard" ? "tab active" : "tab"}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={activeTab === "settings" ? "tab active" : "tab"}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
          <button
            className={activeTab === "diagnostics" ? "tab active" : "tab"}
            onClick={() => setActiveTab("diagnostics")}
          >
            Diagnostics
          </button>
        </nav>
      </header>

      <main className="content">
        {activeTab === "setup" && (
          <section className="panel">
            <h2>Setup Wizard</h2>
            <p className="muted">
              Complete these steps to install OpenClaw in WSL2, configure providers, and launch
              the embedded dashboard.
            </p>

            <div className="card">
              <div className="card-title">Step 1: Preflight checks</div>
              <button className="btn ghost" onClick={() => void refreshPrereqs()}>
                Refresh Checks
              </button>
              <div className="check-grid">
                {(prereqs?.checks ?? []).map((check) => (
                  <div className="check-item" key={check.id}>
                    <span className={check.ok ? "dot ok" : "dot bad"} />
                    <div>
                      <strong>{check.id}</strong>
                      <p>{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Step 2: Install OpenClaw</div>
              <label className="field">
                <span>Version tag (optional)</span>
                <input
                  value={versionTagInput}
                  onChange={(event) => setVersionTagInput(event.target.value)}
                  placeholder="latest"
                />
              </label>
              <button className="btn primary" disabled={installRunning} onClick={() => void handleBootstrap()}>
                {installRunning ? "Installing..." : "Run Bootstrap"}
              </button>
              <div className="log">
                {installHistory.length === 0 && <p>No install events yet.</p>}
                {installHistory.map((event, index) => (
                  <p key={`${event.timestamp}-${index}`}>
                    [{new Date(event.timestamp).toLocaleTimeString()}] {event.step}: {event.message}
                  </p>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Step 3: Add and verify API keys</div>
              {PROVIDERS.map((provider) => (
                <div className="provider-row" key={provider}>
                  <div className="provider-head">
                    <strong>{PROVIDER_LABEL[provider]}</strong>
                    <span className={configuredProviders.includes(provider) ? "state good" : "state"}>
                      {providerStateText(provider)}
                    </span>
                  </div>
                  <div className="provider-controls">
                    <input
                      value={keys[provider]}
                      onChange={(event) =>
                        setKeys((previous) => ({
                          ...previous,
                          [provider]: event.target.value
                        }))
                      }
                      type="password"
                      placeholder={`${PROVIDER_LABEL[provider]} API key`}
                    />
                    <button className="btn primary" onClick={() => void handleVerifyAndSave(provider)}>
                      Verify + Save
                    </button>
                    <button className="btn ghost" onClick={() => void handleRemoveKey(provider)}>
                      Clear
                    </button>
                  </div>
                  {verifyState[provider] && (
                    <p className={verifyState[provider]?.ok ? "text-good" : "text-warn"}>
                      {verifyState[provider]?.message}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">Step 4: Finalize profile and launch</div>
              {!openClawInstalled && (
                <p className="text-warn">
                  Install OpenClaw in Step 2 before finalizing setup.
                </p>
              )}
              <label className="field">
                <span>Default model</span>
                <input
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                  placeholder="deepseek-chat"
                />
              </label>
              <button className="btn primary" onClick={() => void handleFinalizeSetup()}>
                Apply Profile + Start Gateway
              </button>
            </div>
          </section>
        )}

        {activeTab === "dashboard" && (
          <section className="panel">
            <h2>Dashboard</h2>
            <div className="toolbar">
              <button className="btn primary" onClick={() => void handleGatewayStart()}>
                Start
              </button>
              <button className="btn ghost" onClick={() => void handleGatewayStop()}>
                Stop
              </button>
              <button className="btn ghost" onClick={() => void refreshGateway()}>
                Refresh Status
              </button>
              <button className="btn ghost" onClick={() => void window.openClawDesktop.gateway.openDashboardWindow()}>
                Focus App
              </button>
            </div>
            <div className="status-line">
              Gateway:{" "}
              <strong className={gateway.running ? "text-good" : "text-warn"}>
                {gateway.running ? "Running" : "Stopped"}
              </strong>{" "}
              {gateway.url ? `(${gateway.url})` : ""}
              {gateway.error ? ` - ${gateway.error}` : ""}
            </div>
            {gateway.running && gateway.url ? (
              <iframe className="dashboard-frame" src={gateway.url} title="OpenClaw Dashboard" />
            ) : (
              <div className="empty-state">
                Start the gateway to load the embedded dashboard.
                {gateway.error?.includes("openclaw CLI not found") && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn primary" onClick={() => setActiveTab("setup")}>
                      Go To Setup
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "settings" && (
          <section className="panel">
            <h2>Settings</h2>
            <div className="card">
              <div className="card-title">Runtime behavior</div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings?.gatewayAutoStart ?? false}
                  onChange={(event) =>
                    void handleSettingsPatch({ gatewayAutoStart: event.target.checked })
                  }
                />
                <span>Auto-start gateway on app launch</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings?.startWithWindows ?? false}
                  onChange={(event) =>
                    void handleSettingsPatch({ startWithWindows: event.target.checked })
                  }
                />
                <span>Start app with Windows</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings?.searchEnabled ?? true}
                  onChange={(event) =>
                    void handleSettingsPatch({ searchEnabled: event.target.checked })
                  }
                />
                <span>Enable Perplexity web search tool</span>
              </label>
            </div>

            <div className="card">
              <div className="card-title">Updates</div>
              <label className="field">
                <span>Release channel</span>
                <select
                  value={settings?.releaseChannel ?? "stable"}
                  onChange={(event) =>
                    void handleSettingsPatch({
                      releaseChannel: event.target.value as "stable" | "beta"
                    })
                  }
                >
                  <option value="stable">Stable</option>
                  <option value="beta">Beta</option>
                </select>
              </label>
              <button className="btn primary" onClick={() => void handleUpdateCheck()}>
                Check for updates
              </button>
              {updateInfo && (
                <p>
                  Current: {updateInfo.currentVersion} | Latest: {updateInfo.latestVersion ?? "N/A"} |{" "}
                  {updateInfo.message}
                </p>
              )}
            </div>

            <div className="card">
              <div className="card-title">Configured providers</div>
              <p>{configuredProviders.length ? configuredProviders.join(", ") : "None configured."}</p>
            </div>
          </section>
        )}

        {activeTab === "diagnostics" && (
          <section className="panel">
            <h2>Diagnostics</h2>
            <div className="toolbar">
              <button className="btn ghost" onClick={() => void refreshDiagnostics()}>
                Refresh diagnostics
              </button>
            </div>

            <div className="card">
              <div className="card-title">Provider health</div>
              <div className="check-grid">
                {health.map((entry) => (
                  <div className="check-item" key={entry.provider}>
                    <span className={entry.ok ? "dot ok" : "dot bad"} />
                    <div>
                      <strong>{PROVIDER_LABEL[entry.provider]}</strong>
                      <p>
                        {entry.ok ? "Healthy" : "Unhealthy"} - {entry.message ?? ""} ({entry.latencyMs}
                        ms)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Logs</div>
              <label className="field">
                <span>Export path</span>
                <input
                  value={exportPath}
                  onChange={(event) => setExportPath(event.target.value)}
                  placeholder="C:\\Users\\you\\Desktop\\openclaw-desktop.log"
                />
              </label>
              <button className="btn ghost" onClick={() => void handleExportLogs()}>
                Export logs
              </button>
              <pre className="logs-panel">{logs.join("\n")}</pre>
            </div>
          </section>
        )}
      </main>

      <footer className="status-bar">{statusMessage}</footer>
    </div>
  );
}
