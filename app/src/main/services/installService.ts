import fs from "node:fs/promises";
import type { InstallProgressEvent } from "../../shared/types";
import { logger } from "./logger";
import { getVersionLockPath } from "./pathResolver";
import { bashQuote, WslService } from "./wslService";

type ProgressCallback = (event: InstallProgressEvent) => void;

const OPENCLAW_UPSTREAM = "$HOME/openclaw-upstream";
const OPENCLAW_REPO = "https://github.com/openclaw/openclaw.git";

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

    const tag = versionTag ?? (await this.readPinnedVersionTag());

    emit(this.event("preflight", `Using OpenClaw version tag ${tag}.`, true));
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

    emit(this.event("checkout", `Checking out tag ${tag}.`, true));
    await this.requireSuccessful(
      this.wslService.runBash(
        [
          "set -euo pipefail",
          `cd ${OPENCLAW_UPSTREAM}`,
          "git fetch --tags --force",
          `git checkout ${bashQuote(tag)}`
        ].join("\n"),
        { timeoutMs: 120_000 }
      ),
      `Failed to checkout OpenClaw tag ${tag}.`
    );

    emit(this.event("install", "Running OpenClaw installer.", true));
    await this.requireSuccessful(
      this.wslService.runBash(
        [
          "set -euo pipefail",
          `cd ${OPENCLAW_UPSTREAM}`,
          "if [ -x ./install.sh ]; then",
          "  ./install.sh --yes --auth-choice none --no-daemon-start --no-browser-open",
          "elif [ -x ./scripts/install.sh ]; then",
          "  ./scripts/install.sh --yes --auth-choice none --no-daemon-start --no-browser-open",
          "else",
          "  echo \"OpenClaw install script not found.\" >&2",
          "  exit 1",
          "fi"
        ].join("\n"),
        { timeoutMs: 360_000 }
      ),
      "OpenClaw installer failed."
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
      return tag || "main";
    } catch {
      return "main";
    }
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
