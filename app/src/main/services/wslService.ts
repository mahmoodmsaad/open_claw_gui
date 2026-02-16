import { runProcess, type CommandResult } from "./processRunner";

export type WslStatus = {
  installed: boolean;
  ubuntuInstalled: boolean;
  defaultDistro?: string;
  statusText: string;
  distroText: string;
};

export type WslRunOptions = {
  timeoutMs?: number;
  stdin?: string;
};

export function bashQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export class WslService {
  async runRaw(args: string[], options: WslRunOptions = {}): Promise<CommandResult> {
    return runProcess("wsl", args, options);
  }

  async runBash(script: string, options: WslRunOptions = {}): Promise<CommandResult> {
    return this.runRaw(["bash", "-lc", script], options);
  }

  async checkWslStatus(): Promise<WslStatus> {
    try {
      const [statusResult, distroResult] = await Promise.all([
        this.runRaw(["--status"], { timeoutMs: 20_000 }),
        this.runRaw(["-l", "-v"], { timeoutMs: 20_000 })
      ]);

      const statusText = `${statusResult.stdout}${statusResult.stderr}`.trim();
      const distroText = `${distroResult.stdout}${distroResult.stderr}`.trim();
      const defaultMatch =
        statusText.match(/Default Distribution:\s*([^\r\n]+)/i) ??
        distroText.match(/^\*\s+([^\s]+)/m);

      const defaultDistro = defaultMatch?.[1]?.trim();
      const ubuntuInstalled = /ubuntu/i.test(distroText);

      return {
        installed: true,
        ubuntuInstalled,
        defaultDistro,
        statusText,
        distroText
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "WSL command failed";
      return {
        installed: false,
        ubuntuInstalled: false,
        statusText: message,
        distroText: ""
      };
    }
  }

  async writeOpenClawFile(fileName: string, content: string): Promise<void> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safeName) {
      throw new Error("Invalid OpenClaw file name.");
    }
    const script = [
      "set -euo pipefail",
      "mkdir -p \"$HOME/.openclaw\"",
      `cat > "$HOME/.openclaw/${safeName}"`
    ].join("\n");
    const result = await this.runBash(script, {
      stdin: content,
      timeoutMs: 30_000
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Unable to write OpenClaw file in WSL");
    }
  }

  async ensureOpenClawDirectory(): Promise<void> {
    const result = await this.runBash("mkdir -p \"$HOME/.openclaw\"");
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Failed to create ~/.openclaw");
    }
  }
}
