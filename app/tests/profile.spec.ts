import { describe, expect, it } from "vitest";
import { buildOpenClawConfig, resolveDefaultModel, resolvePreferredProviders } from "../src/shared/profile";

describe("profile helpers", () => {
  it("resolves preferred providers in DeepSeek-first order", () => {
    const result = resolvePreferredProviders(["openai", "deepseek", "perplexity"]);
    expect(result).toEqual(["deepseek", "openai"]);
  });

  it("resolves default model from provider list", () => {
    expect(resolveDefaultModel(["openai"])).toBe("gpt-4.1-mini");
    expect(resolveDefaultModel(["anthropic"])).toBe("claude-3-5-haiku-latest");
  });

  it("builds openclaw config with web search toggle", () => {
    const config = buildOpenClawConfig({
      enabledProviders: ["deepseek", "openai", "perplexity"],
      defaultModel: "deepseek-chat",
      fallbackChain: ["deepseek", "openai", "anthropic"],
      searchEnabled: true
    });

    expect(config.defaultModel).toBe("deepseek-chat");
    expect(config.providers).toHaveProperty("deepseek");
    expect(config.providers).toHaveProperty("openai");
    expect(config.providers).toHaveProperty("fallback");
    expect(config.tools).toHaveProperty("web_search");
  });
});
