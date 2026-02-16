import type { ProviderHealth, ProviderId } from "./types";

const PRIORITY: ProviderId[] = ["deepseek", "openai", "anthropic"];

export function chooseBestProvider(health: ProviderHealth[]): ProviderId | undefined {
  const healthy = new Set(
    health
      .filter((entry) => entry.ok)
      .map((entry) => entry.provider)
      .filter((provider): provider is ProviderId => provider !== "perplexity")
  );

  return PRIORITY.find((provider) => healthy.has(provider));
}

export function shouldFailover(failureCount: number, threshold = 3): boolean {
  return failureCount >= threshold;
}
