import fs from "node:fs/promises";
import type { AppSettings } from "../../shared/types";
import { getSettingsFilePath } from "./pathResolver";

const DEFAULT_SETTINGS: AppSettings = {
  gatewayAutoStart: false,
  startWithWindows: false,
  searchEnabled: true,
  releaseChannel: "stable"
};

export class SettingsStore {
  async getSettings(): Promise<AppSettings> {
    try {
      const file = await fs.readFile(getSettingsFilePath(), "utf8");
      const parsed = JSON.parse(file) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
    } catch {
      await this.saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await fs.writeFile(
      getSettingsFilePath(),
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf8"
    );
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next = {
      ...current,
      ...patch
    };
    await this.saveSettings(next);
    return next;
  }
}
