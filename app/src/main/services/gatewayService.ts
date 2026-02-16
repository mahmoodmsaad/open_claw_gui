import type { GatewayStatus } from "../../shared/types";
import { logger } from "./logger";
import { bashQuote, WslService } from "./wslService";

export class GatewayService {
  constructor(private readonly wslService: WslService) {}

  async start(): Promise<GatewayStatus> {
    const openClawPath = await this.resolveOpenClawPath();
    if (!openClawPath) {
      return {
        running: false,
        error: "openclaw CLI not found in WSL."
      };
    }

    const current = await this.readGatewayStatus(openClawPath);
    if (current.running) {
      return current;
    }

    const startAttempt = await this.wslService.runBash(
      [
        "set +e",
        `OPENCLAW_CMD=${bashQuote(openClawPath)}`,
        "\"$OPENCLAW_CMD\" gateway start --json 2>&1 || true"
      ].join("\n"),
      { timeoutMs: 60_000 }
    );

    const startPayload = this.parseJsonObject(`${startAttempt.stdout}\n${startAttempt.stderr}`);
    const startError =
      typeof startPayload?.error === "string" && startPayload.error.trim()
        ? startPayload.error.trim()
        : undefined;

    const afterServiceStart = await this.readGatewayStatus(openClawPath);
    if (afterServiceStart.running) {
      return afterServiceStart;
    }

    await this.wslService.runBash(
      [
        "set +e",
        `OPENCLAW_CMD=${bashQuote(openClawPath)}`,
        "nohup \"$OPENCLAW_CMD\" gateway run >/tmp/openclaw-desktop-gateway.log 2>&1 &",
        "echo $! >/tmp/openclaw-desktop-gateway.pid",
        "sleep 3"
      ].join("\n"),
      { timeoutMs: 30_000 }
    );

    const afterFallbackStart = await this.readGatewayStatus(openClawPath);
    if (afterFallbackStart.running) {
      return afterFallbackStart;
    }

    return {
      running: false,
      error: startError ?? afterFallbackStart.error ?? "Failed to start OpenClaw gateway."
    };
  }

  async stop(): Promise<GatewayStatus> {
    const openClawPath = await this.resolveOpenClawPath();
    if (!openClawPath) {
      return { running: false };
    }

    const result = await this.wslService.runBash(
      [
        "set +e",
        `OPENCLAW_CMD=${bashQuote(openClawPath)}`,
        "\"$OPENCLAW_CMD\" gateway stop --json >/tmp/openclaw-desktop-gateway-stop.log 2>&1 || true",
        "if [ -f /tmp/openclaw-desktop-gateway.pid ]; then",
        "  kill \"$(cat /tmp/openclaw-desktop-gateway.pid)\" >/dev/null 2>&1 || true",
        "  rm -f /tmp/openclaw-desktop-gateway.pid",
        "fi",
        "pkill -f \"openclaw gateway run\" >/dev/null 2>&1 || true",
        "pkill -f \"openclaw gateway\" >/dev/null 2>&1 || true",
        "pkill -f \"clawdbot-gateway\" >/dev/null 2>&1 || true",
        "sleep 1",
        "\"$OPENCLAW_CMD\" status --json 2>/dev/null || true"
      ].join("\n"),
      { timeoutMs: 30_000 }
    );

    if (result.exitCode !== 0) {
      return {
        running: false,
        error: result.stderr || "Gateway stop returned an error."
      };
    }

    const parsed = this.parseStatusOutput(result.stdout);
    if (parsed?.running) {
      return {
        ...parsed,
        error: "Gateway still appears to be running."
      };
    }

    return { running: false, url: parsed?.url };
  }

  async status(): Promise<GatewayStatus> {
    const openClawPath = await this.resolveOpenClawPath();
    if (!openClawPath) {
      return {
        running: false,
        error: "openclaw CLI not found in WSL."
      };
    }

    return this.readGatewayStatus(openClawPath);
  }

  private async readGatewayStatus(openClawPath: string): Promise<GatewayStatus> {
    const statusResult = await this.wslService.runBash(
      [
        "set +e",
        `OPENCLAW_CMD=${bashQuote(openClawPath)}`,
        "\"$OPENCLAW_CMD\" status --json 2>/dev/null || true"
      ].join("\n"),
      { timeoutMs: 20_000 }
    );
    const structured = this.parseStatusOutput(statusResult.stdout);
    if (structured) {
      return structured;
    }

    const gatewayStatusResult = await this.wslService.runBash(
      [
        "set +e",
        `OPENCLAW_CMD=${bashQuote(openClawPath)}`,
        "\"$OPENCLAW_CMD\" gateway status --json 2>/dev/null || \"$OPENCLAW_CMD\" gateway status 2>/dev/null || true"
      ].join("\n"),
      { timeoutMs: 20_000 }
    );
    return this.parseGatewayOutput(gatewayStatusResult.stdout);
  }

  private async resolveOpenClawPath(): Promise<string | null> {
    const result = await this.wslService.runBash(
      [
        "set +e",
        "if command -v openclaw >/dev/null 2>&1; then",
        "  command -v openclaw",
        "  exit 0",
        "fi",
        "for candidate in \"$HOME/.openclaw/bin/openclaw\" \"$HOME/.local/bin/openclaw\" \"/usr/local/bin/openclaw\" \"/usr/bin/openclaw\"; do",
        "  if [ -x \"$candidate\" ]; then",
        "    echo \"$candidate\"",
        "    exit 0",
        "  fi",
        "done",
        "exit 1"
      ].join("\n"),
      { timeoutMs: 10_000 }
    );
    if (result.exitCode !== 0) {
      return null;
    }
    const value = result.stdout.trim();
    return value || null;
  }

  private parseStatusOutput(raw: string): GatewayStatus | null {
    const payload = this.parseJsonObject(raw);
    if (!payload) {
      return null;
    }

    if (typeof payload.running === "boolean") {
      const directUrl = typeof payload.url === "string" ? this.toDashboardUrl(payload.url) : undefined;
      const directError = typeof payload.error === "string" ? payload.error : undefined;
      return {
        running: payload.running,
        url: directUrl,
        error: directError
      };
    }

    const gateway = this.asRecord(payload.gateway);
    if (gateway) {
      const reachable = gateway.reachable === true;
      const wsUrl = typeof gateway.url === "string" ? gateway.url : undefined;
      const gatewayError = typeof gateway.error === "string" ? gateway.error : undefined;
      return {
        running: reachable,
        url: reachable ? this.toDashboardUrl(wsUrl) : undefined,
        error: reachable ? undefined : gatewayError
      };
    }

    const rpc = this.asRecord(payload.rpc);
    const rpcOk = rpc?.ok === true;
    const rpcUrl = typeof rpc?.url === "string" ? rpc.url : undefined;
    if (rpc) {
      return {
        running: rpcOk,
        url: rpcOk ? this.toDashboardUrl(rpcUrl) : undefined
      };
    }

    return null;
  }

  private parseGatewayOutput(raw: string): GatewayStatus {
    const structured = this.parseStatusOutput(raw);
    if (structured) {
      return structured;
    }

    const text = raw.trim();
    if (!text) {
      return { running: false };
    }

    const dashboardUrl =
      text.match(/Dashboard:\s*(https?:\/\/[^\s]+)/i)?.[1] ?? text.match(/https?:\/\/[^\s]+/i)?.[0];
    const isRunning =
      /RPC probe:\s*ok/i.test(text) ||
      /Listening:\s*[0-9.]+:[0-9]+/i.test(text) ||
      /"reachable"\s*:\s*true/i.test(text) ||
      /"ok"\s*:\s*true/i.test(text);

    return {
      running: isRunning,
      url: isRunning ? this.toDashboardUrl(dashboardUrl) : undefined,
      error: isRunning ? undefined : text
    };
  }

  private parseJsonObject(raw: string): Record<string, unknown> | null {
    const text = raw.trim();
    if (!text) {
      return null;
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    } catch (error) {
      logger.debug("Unable to parse gateway JSON output.", error);
      return null;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toDashboardUrl(url?: string): string | undefined {
    if (!url) {
      return undefined;
    }
    if (url.startsWith("ws://")) {
      return `http://${url.slice("ws://".length)}/`;
    }
    if (url.startsWith("wss://")) {
      return `https://${url.slice("wss://".length)}/`;
    }
    return url;
  }
}
