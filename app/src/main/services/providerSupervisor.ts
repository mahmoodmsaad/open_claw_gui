import { chooseBestProvider, shouldFailover } from "../../shared/fallback";
import type { AppSettings, ProviderId } from "../../shared/types";
import { ConfigService } from "./configService";
import { CredentialService } from "./credentialService";
import { DiagnosticsService } from "./diagnosticsService";
import { GatewayService } from "./gatewayService";
import { logger } from "./logger";

type NotifyFn = (message: string) => void;

const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-haiku-latest",
  perplexity: "sonar"
};

export class ProviderSupervisor {
  private timer: NodeJS.Timeout | undefined;
  private failureCounts: Map<ProviderId, number> = new Map();
  private activeProvider: ProviderId | undefined;
  private settings: AppSettings = {
    gatewayAutoStart: false,
    startWithWindows: false,
    searchEnabled: true,
    releaseChannel: "stable"
  };

  constructor(
    private readonly credentials: CredentialService,
    private readonly diagnostics: DiagnosticsService,
    private readonly configService: ConfigService,
    private readonly gateway: GatewayService,
    private readonly notify: NotifyFn
  ) {}

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async initialize(settings: AppSettings): Promise<void> {
    this.settings = settings;
    await this.runCheck(true);
    this.timer = setInterval(() => {
      void this.runCheck(false);
    }, 60_000);
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  private async runCheck(initializeOnly: boolean): Promise<void> {
    try {
      const configured = await this.credentials.listConfigured();
      const health = await this.diagnostics.healthCheckProviders();
      const best = chooseBestProvider(health);
      if (!best) {
        return;
      }

      if (!this.activeProvider) {
        this.activeProvider = best;
      }

      const activeHealth = health.find((entry) => entry.provider === this.activeProvider);
      if (!activeHealth?.ok) {
        const nextCount = (this.failureCounts.get(this.activeProvider) ?? 0) + 1;
        this.failureCounts.set(this.activeProvider, nextCount);

        if (!initializeOnly && shouldFailover(nextCount) && best !== this.activeProvider) {
          await this.applyProvider(best, configured, this.settings.searchEnabled);
          this.notify(`Provider failover activated: ${this.activeProvider} -> ${best}`);
          this.activeProvider = best;
          this.failureCounts.clear();
          await this.gateway.stop();
          await this.gateway.start();
        }
      } else if (this.activeProvider) {
        this.failureCounts.set(this.activeProvider, 0);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider supervision failed.";
      logger.warn(message);
    }
  }

  private async applyProvider(
    provider: ProviderId,
    configured: ProviderId[],
    searchEnabled: boolean
  ): Promise<void> {
    await this.configService.applyProfile({
      enabledProviders: configured,
      defaultModel: DEFAULT_MODEL_BY_PROVIDER[provider],
      fallbackChain: ["deepseek", "openai", "anthropic"],
      searchEnabled
    });
  }
}
