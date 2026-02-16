import keytar from "keytar";
import type { ProviderId, SaveResult, VerifyResult } from "../../shared/types";

const SERVICE_NAME = "openclaw";

const ACCOUNT_MAP: Record<ProviderId, string> = {
  deepseek: "deepseek",
  openai: "openai",
  anthropic: "anthropic",
  perplexity: "perplexity"
};

const PROVIDERS: ProviderId[] = ["deepseek", "openai", "anthropic", "perplexity"];

export class CredentialService {
  async save(provider: ProviderId, key: string): Promise<SaveResult> {
    const account = ACCOUNT_MAP[provider];
    await keytar.setPassword(SERVICE_NAME, account, key.trim());
    return { ok: true, message: `${provider} key saved.` };
  }

  async remove(provider: ProviderId): Promise<SaveResult> {
    const account = ACCOUNT_MAP[provider];
    await keytar.deletePassword(SERVICE_NAME, account);
    return { ok: true, message: `${provider} key removed.` };
  }

  async get(provider: ProviderId): Promise<string | null> {
    const account = ACCOUNT_MAP[provider];
    return keytar.getPassword(SERVICE_NAME, account);
  }

  async listConfigured(): Promise<ProviderId[]> {
    const configured: ProviderId[] = [];
    for (const provider of PROVIDERS) {
      const key = await this.get(provider);
      if (key) {
        configured.push(provider);
      }
    }
    return configured;
  }

  async verify(provider: ProviderId, key: string): Promise<VerifyResult> {
    const cleaned = key.trim();
    if (!cleaned) {
      return {
        ok: false,
        canSkip: false,
        provider,
        latencyMs: 0,
        message: "API key is required."
      };
    }

    try {
      switch (provider) {
        case "deepseek":
          return await this.verifyDeepSeek(cleaned);
        case "openai":
          return await this.verifyOpenAI(cleaned);
        case "anthropic":
          return await this.verifyAnthropic(cleaned);
        case "perplexity":
          return await this.verifyPerplexity(cleaned);
        default:
          return {
            ok: false,
            canSkip: false,
            provider,
            latencyMs: 0,
            message: "Unsupported provider."
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      return {
        ok: false,
        canSkip: true,
        provider,
        latencyMs: 0,
        message
      };
    }
  }

  private async verifyDeepSeek(key: string): Promise<VerifyResult> {
    const body = {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1
    };
    return this.runProbe(
      "deepseek",
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
  }

  private async verifyOpenAI(key: string): Promise<VerifyResult> {
    return this.runProbe("openai", "https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`
      }
    });
  }

  private async verifyAnthropic(key: string): Promise<VerifyResult> {
    const body = {
      model: "claude-3-5-haiku-latest",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }]
    };
    return this.runProbe("anthropic", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  private async verifyPerplexity(key: string): Promise<VerifyResult> {
    const body = {
      model: "sonar",
      messages: [{ role: "user", content: "ping" }]
    };
    return this.runProbe(
      "perplexity",
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
  }

  private async runProbe(
    provider: ProviderId,
    url: string,
    init: RequestInit
  ): Promise<VerifyResult> {
    const controller = new AbortController();
    const started = Date.now();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return {
          ok: true,
          canSkip: false,
          provider,
          latencyMs,
          statusCode: response.status,
          message: "Key verified."
        };
      }

      let hint = "Invalid key or provider response.";
      if (response.status === 401 || response.status === 403) {
        hint = "Authentication failed. Check key value and permissions.";
      }

      return {
        ok: false,
        canSkip: false,
        provider,
        latencyMs,
        statusCode: response.status,
        message: `${hint} (HTTP ${response.status})`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network verification failed.";
      return {
        ok: false,
        canSkip: true,
        provider,
        latencyMs: Date.now() - started,
        message
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
