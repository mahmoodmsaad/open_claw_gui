import type { GatewayStatus } from "../../shared/types";
import { logger } from "./logger";
import { WslService } from "./wslService";

export class GatewayService {
  constructor(private readonly wslService: WslService) {}

  async start(): Promise<GatewayStatus> {
    const bootstrap = await this.wslService.runBash(
      [
        "set +e",
        "if ! command -v openclaw >/dev/null 2>&1; then",
        "  echo '{\"running\":false,\"error\":\"openclaw CLI not found in WSL.\"}'",
        "  exit 0",
        "fi",
        "(openclaw gateway start --no-browser-open >/tmp/openclaw-desktop-gateway.log 2>&1 &)",
        "sleep 3",
        "openclaw gateway status --json 2>/dev/null || true"
      ].join("\n"),
      { timeoutMs: 60_000 }
    );

    if (bootstrap.exitCode !== 0) {
      logger.error("Gateway start failed:", bootstrap.stderr);
      return {
        running: false,
        error: bootstrap.stderr || "Failed to start OpenClaw gateway."
      };
    }

    const parsed = this.parseGatewayOutput(bootstrap.stdout);
    if (parsed.running && !parsed.url) {
      parsed.url = "http://127.0.0.1:3000";
    }
    return parsed;
  }

  async stop(): Promise<GatewayStatus> {
    const result = await this.wslService.runBash(
      [
        "set +e",
        "openclaw gateway stop >/dev/null 2>&1 || pkill -f \"openclaw gateway\" >/dev/null 2>&1 || true",
        "echo '{\"running\":false}'"
      ].join("\n"),
      { timeoutMs: 30_000 }
    );

    if (result.exitCode !== 0) {
      return {
        running: false,
        error: result.stderr || "Gateway stop returned an error."
      };
    }

    return { running: false };
  }

  async status(): Promise<GatewayStatus> {
    const result = await this.wslService.runBash(
      [
        "set +e",
        "if ! command -v openclaw >/dev/null 2>&1; then",
        "  echo '{\"running\":false,\"error\":\"openclaw CLI not found in WSL.\"}'",
        "  exit 0",
        "fi",
        "RAW=\"$(openclaw gateway status --json 2>/dev/null || true)\"",
        "if [ -n \"$RAW\" ]; then",
        "  echo \"$RAW\"",
        "  exit 0",
        "fi",
        "TXT=\"$(openclaw gateway status 2>/dev/null || true)\"",
        "if echo \"$TXT\" | grep -qi \"running\"; then",
        "  URL=\"$(echo \"$TXT\" | grep -Eo 'https?://[^ ]+' | head -n1)\"",
        "  echo \"{\\\"running\\\":true,\\\"url\\\":\\\"${URL:-http://127.0.0.1:3000}\\\"}\"",
        "else",
        "  echo '{\"running\":false}'",
        "fi"
      ].join("\n"),
      { timeoutMs: 20_000 }
    );

    if (result.exitCode !== 0) {
      return {
        running: false,
        error: result.stderr || "Gateway status failed."
      };
    }

    return this.parseGatewayOutput(result.stdout);
  }

  private parseGatewayOutput(raw: string): GatewayStatus {
    const text = raw.trim();
    if (!text) {
      return { running: false };
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines.reverse()) {
      try {
        const parsed = JSON.parse(line) as Partial<GatewayStatus>;
        return {
          running: Boolean(parsed.running),
          url: parsed.url,
          pid: parsed.pid,
          error: parsed.error
        };
      } catch {
        // Continue trying lines.
      }
    }

    const foundUrl = text.match(/https?:\/\/[^\s]+/i)?.[0];
    const isRunning = /running/i.test(text);
    return {
      running: isRunning,
      url: foundUrl,
      error: isRunning ? undefined : text
    };
  }
}
