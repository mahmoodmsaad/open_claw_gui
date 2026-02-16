import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import semver from "semver";
import type { UpdateInfo } from "../../shared/types";

type RepoInfo = {
  owner: string;
  repo: string;
};

export class UpdateService {
  async check(channel: "stable" | "beta" = "stable"): Promise<UpdateInfo> {
    const currentVersion = app.getVersion();
    const repo = await this.resolveRepository();
    if (!repo) {
      return {
        currentVersion,
        updateAvailable: false,
        message: "No GitHub repository configured for update checks."
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const endpoint =
        channel === "beta"
          ? `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=20`
          : `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`;

      const response = await fetch(endpoint, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          currentVersion,
          updateAvailable: false,
          message: `Update endpoint returned HTTP ${response.status}.`
        };
      }

      const payload = channel === "beta"
        ? this.selectBetaRelease((await response.json()) as GitHubRelease[])
        : (await response.json()) as GitHubRelease;

      if (!payload) {
        return {
          currentVersion,
          updateAvailable: false,
          message: "No release found for selected update channel."
        };
      }

      const latestTag = (payload.tag_name ?? "").trim();
      if (!latestTag) {
        return {
          currentVersion,
          updateAvailable: false,
          message: "Latest release tag was empty."
        };
      }

      const latestVersion = latestTag.startsWith("v") ? latestTag.slice(1) : latestTag;
      const normalizedCurrent = currentVersion.startsWith("v")
        ? currentVersion.slice(1)
        : currentVersion;

      const updateAvailable = semver.valid(latestVersion) && semver.valid(normalizedCurrent)
        ? semver.gt(latestVersion, normalizedCurrent)
        : latestVersion !== normalizedCurrent;

      return {
        currentVersion,
        latestVersion: latestTag,
        releaseUrl: payload.html_url,
        updateAvailable,
        message: updateAvailable
          ? `Update available on ${channel} channel.`
          : `You are on the latest ${channel} version.`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to check updates.";
      return {
        currentVersion,
        updateAvailable: false,
        message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private selectBetaRelease(releases: GitHubRelease[]): GitHubRelease | undefined {
    if (!Array.isArray(releases) || releases.length === 0) {
      return undefined;
    }
    const prerelease = releases.find((entry) => entry.prerelease);
    return prerelease ?? releases[0];
  }

  private async resolveRepository(): Promise<RepoInfo | undefined> {
    try {
      const packagePath = path.join(app.getAppPath(), "package.json");
      const raw = await fs.readFile(packagePath, "utf8");
      const parsed = JSON.parse(raw) as {
        repository?: string | { url?: string };
      };
      const url =
        typeof parsed.repository === "string"
          ? parsed.repository
          : parsed.repository?.url;
      if (!url) {
        return undefined;
      }

      const match = url.match(/github\.com[:/]+([^/]+)\/([^/.]+)(?:\.git)?/i);
      if (!match?.[1] || !match[2]) {
        return undefined;
      }

      return {
        owner: match[1],
        repo: match[2]
      };
    } catch {
      return undefined;
    }
  }
}

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  prerelease?: boolean;
};
