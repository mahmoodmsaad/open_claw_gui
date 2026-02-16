import fs from "node:fs/promises";
import type { InstallProgressEvent } from "../../shared/types";
import { logger } from "./logger";
import { getVersionLockPath } from "./pathResolver";
import { bashQuote, WslService } from "./wslService";

type ProgressCallback = (event: InstallProgressEvent) => void;

const OPENCLAW_UPSTREAM = "$HOME/openclaw-upstream";
const OPENCLAW_REPO = "https://github.com/openclaw/openclaw.git";
const OPENCLAW_INSTALL_URL = "https://openclaw.ai/install.sh";

export class InstallService {
  constructor(private readonly wslService: WslService) {}

  async runBootstrap(
    versionTag?: string,
    progressCallback?: ProgressCallback
  ): Promise<InstallProgressEvent[]> {
    const events: InstallProgressEvent[] = [];
    const emit = (event: InstallProgressEvent): void => {
      events.push(event);
      progressCallback?.(event);
      logger.info(`[bootstrap:${event.step}] ${event.message}`);
    };

    const rawTag = versionTag ?? (await this.readPinnedVersionTag());
    const requestedVersion = this.normalizeVersion(rawTag);

    emit(this.event("preflight", `Using OpenClaw version ${requestedVersion}.`, true));
    await this.requireSuccessful(
      this.wslService.runBash("command -v git >/dev/null && command -v curl >/dev/null"),
      "Required WSL packages missing (git/curl). Install them in Ubuntu and retry."
    );

    emit(this.event("clone", "Ensuring upstream repository is present.", true));
    await this.requireSuccessful(
      this.wslService.runBash(
        [
          "set -euo pipefail",
          `if [ ! -d ${OPENCLAW_UPSTREAM}/.git ]; then`,
          `  git clone ${OPENCLAW_REPO} ${OPENCLAW_UPSTREAM}`,
          "fi"
        ].join("\n"),
        { timeoutMs: 180_000 }
      ),
      "Failed to clone OpenClaw upstream repository."
    );

    const checkoutResult = await this.wslService.runBash(
      [
        "set -euo pipefail",
        `cd ${OPENCLAW_UPSTREAM}`,
        "git fetch --tags --force",
        `git checkout ${bashQuote(rawTag)}`
      ].join("\n"),
      { timeoutMs: 120_000 }
    );
    if (checkoutResult.exitCode === 0) {
      emit(this.event("checkout", `Checked out upstream tag/ref ${rawTag}.`, true));
    } else {
      emit(
        this.event(
          "checkout",
          `Could not checkout ${rawTag}; continuing with installer version ${requestedVersion}.`,
          false
        )
      );
    }

    emit(this.event("install", `Running OpenClaw installer (${requestedVersion}).`, true));
    let installResult = await this.installOpenClaw(requestedVersion);
    if (installResult.exitCode !== 0 && requestedVersion !== "latest") {
      emit(
        this.event(
          "install",
          `Install for ${requestedVersion} failed; retrying with latest.`,
          false
        )
      );
      installResult = await this.installOpenClaw("latest");
    }
    if (installResult.exitCode !== 0) {
      throw new Error(installResult.stderr.trim() || "OpenClaw installer failed.");
    }

    await this.requireSuccessful(
      this.wslService.runBash("command -v openclaw >/dev/null 2>&1"),
      "OpenClaw installed but CLI is not on PATH in WSL."
    );

    emit(this.event("configure", "Creating OpenClaw configuration directory.", true));
    await this.requireSuccessful(
      this.wslService.runBash("mkdir -p \"$HOME/.openclaw\""),
      "Failed to create ~/.openclaw."
    );

    emit(this.event("done", "Bootstrap finished successfully.", true));
    return events;
  }

  private async readPinnedVersionTag(): Promise<string> {
    try {
      const raw = await fs.readFile(getVersionLockPath(), "utf8");
      const tag = raw.trim();
      return tag || "latest";
    } catch {
      return "latest";
    }
  }

  private normalizeVersion(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "main" || trimmed === "master") {
      return "latest";
    }
    return trimmed;
  }

  private async installOpenClaw(version: string): Promise<{ exitCode: number; stderr: string }> {
    return this.wslService.runBash(
      [
        "set -euo pipefail",
        "export OPENCLAW_NO_PROMPT=1",
        "export OPENCLAW_NO_ONBOARD=1",
        "export OPENCLAW_USE_GUM=0",
        `export OPENCLAW_VERSION=${bashQuote(version)}`,
        `curl -fsSL --proto '=https' --tlsv1.2 ${OPENCLAW_INSTALL_URL} | bash`
      ].join("\n"),
      { timeoutMs: 480_000 }
    );
  }

  private event(
    step: InstallProgressEvent["step"],
    message: string,
    ok: boolean
  ): InstallProgressEvent {
    return {
      step,
      message,
      ok,
      timestamp: new Date().toISOString()
    };
  }

  private async requireSuccessful(
    promise: Promise<{ exitCode: number; stderr: string }>,
    errorMessage: string
  ): Promise<void> {
    const result = await promise;
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || errorMessage);
    }
  }
}
