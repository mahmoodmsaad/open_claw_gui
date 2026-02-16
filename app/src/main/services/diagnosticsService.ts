import fs from "node:fs/promises";
import path from "node:path";
import type { ExportResult, ProviderHealth, ProviderId } from "../../shared/types";
import { CredentialService } from "./credentialService";
import { logger } from "./logger";
import { getLogFilePath } from "./pathResolver";

const HEALTH_PROVIDERS: ProviderId[] = ["deepseek", "openai", "anthropic", "perplexity"];

export class DiagnosticsService {
  constructor(private readonly credentials: CredentialService) {}

  async getLogs(limit = 200): Promise<string[]> {
    const filePath = getLogFilePath();
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      return lines.slice(-Math.max(limit, 1));
    } catch {
      return ["No logs available yet."];
    }
  }

  async exportLogs(targetPath: string): Promise<ExportResult> {
    try {
      const source = getLogFilePath();
      const dir = path.dirname(targetPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(source, targetPath);
      return {
        ok: true,
        message: "Logs exported.",
        path: targetPath
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export logs.";
      logger.error("Log export failed:", message);
      return {
        ok: false,
        message
      };
    }
  }

  async healthCheckProviders(): Promise<ProviderHealth[]> {
    const health: ProviderHealth[] = [];
    for (const provider of HEALTH_PROVIDERS) {
      const key = await this.credentials.get(provider);
      if (!key) {
        health.push({
          provider,
          ok: false,
          latencyMs: 0,
          message: "Not configured."
        });
        continue;
      }

      const result = await this.credentials.verify(provider, key);
      health.push({
        provider,
        ok: result.ok,
        latencyMs: result.latencyMs,
        message: result.message
      });
    }
    return health;
  }
}
