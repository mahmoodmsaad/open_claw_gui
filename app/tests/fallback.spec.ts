import { describe, expect, it } from "vitest";
import { chooseBestProvider, shouldFailover } from "../src/shared/fallback";

describe("fallback strategy", () => {
  it("selects healthy provider using deepseek -> openai -> anthropic order", () => {
    const choice = chooseBestProvider([
      { provider: "openai", ok: true, latencyMs: 100 },
      { provider: "deepseek", ok: false, latencyMs: 300 },
      { provider: "anthropic", ok: true, latencyMs: 120 },
      { provider: "perplexity", ok: true, latencyMs: 95 }
    ]);

    expect(choice).toBe("openai");
  });

  it("only triggers failover once threshold reached", () => {
    expect(shouldFailover(2, 3)).toBe(false);
    expect(shouldFailover(3, 3)).toBe(true);
  });
});
