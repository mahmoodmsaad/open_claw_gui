import type { PrereqStatus } from "../../shared/types";
import { runProcess } from "./processRunner";
import { WslService } from "./wslService";

export class PrereqService {
  constructor(private readonly wslService: WslService) {}

  async checkPrereqs(): Promise<PrereqStatus> {
    const checks: PrereqStatus["checks"] = [];

    const isWindows = process.platform === "win32";
    checks.push({
      id: "windows",
      ok: isWindows,
      detail: isWindows ? "Windows detected." : "This app currently supports Windows only."
    });

    const wslStatus = await this.wslService.checkWslStatus();
    checks.push({
      id: "wsl",
      ok: wslStatus.installed,
      detail: wslStatus.installed ? "WSL is available." : wslStatus.statusText
    });

    checks.push({
      id: "ubuntu",
      ok: wslStatus.ubuntuInstalled,
      detail: wslStatus.ubuntuInstalled
        ? `Ubuntu distro detected (${wslStatus.defaultDistro ?? "not default"}).`
        : "Ubuntu WSL distro not found. Install Ubuntu and set WSL2 default."
    });

    const openClawCheck = await this.checkWslCommand("openclaw");
    checks.push({
      id: "openclaw",
      ok: openClawCheck.ok,
      detail: openClawCheck.detail
    });

    const gitCheck = await this.checkCommand("git");
    checks.push({
      id: "git",
      ok: gitCheck.ok,
      detail: gitCheck.detail
    });

    const internetCheck = await this.checkInternet();
    checks.push({
      id: "internet",
      ok: internetCheck.ok,
      detail: internetCheck.detail
    });

    return {
      ok: checks.every((check) => check.ok),
      platform: process.platform,
      checks
    };
  }

  private async checkCommand(command: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const result = await runProcess("where", [command], { timeoutMs: 10_000 });
      if (result.exitCode === 0 && result.stdout.trim()) {
        return { ok: true, detail: `${command} found at ${result.stdout.split(/\r?\n/)[0]}.` };
      }
      return { ok: false, detail: `${command} was not found on PATH.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown command lookup error";
      return { ok: false, detail: message };
    }
  }

  private async checkInternet(): Promise<{ ok: boolean; detail: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("https://docs.openclaw.ai", {
        signal: controller.signal,
        method: "GET"
      });
      return {
        ok: response.ok,
        detail: response.ok
          ? "Internet access confirmed."
          : `Internet reachable but docs.openclaw.ai returned HTTP ${response.status}.`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network check failed";
      return { ok: false, detail: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkWslCommand(command: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const result = await this.wslService.runBash(`command -v ${command}`, {
        timeoutMs: 10_000
      });
      if (result.exitCode === 0 && result.stdout.trim()) {
        return { ok: true, detail: `${command} found in WSL at ${result.stdout.trim()}.` };
      }
      const errorText = result.stderr.trim();
      return {
        ok: false,
        detail: errorText || `${command} CLI not found in WSL. Run Setup -> Install OpenClaw.`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "WSL command lookup failed";
      return { ok: false, detail: message };
    }
  }
}
