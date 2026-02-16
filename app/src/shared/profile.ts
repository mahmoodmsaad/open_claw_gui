import type { OpenClawConfigPatch, ProviderId, ProviderProfile } from "./types";

const MODEL_MAP: Record<ProviderId, string> = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-haiku-latest",
  perplexity: "sonar"
};

const FALLBACK_MODELS: Record<ProviderId, string> = {
  deepseek: "deepseek-chat",
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-haiku-latest",
  perplexity: "sonar"
};

export function resolvePreferredProviders(configuredProviders: ProviderId[]): ProviderId[] {
  const ordered: ProviderId[] = ["deepseek", "openai", "anthropic"];
  return ordered.filter((provider) => configuredProviders.includes(provider));
}

export function resolveDefaultModel(
  configuredProviders: ProviderId[],
  preferredModel?: string
): string {
  if (preferredModel) {
    return preferredModel;
  }

  const preferredProviders = resolvePreferredProviders(configuredProviders);
  const first = preferredProviders[0];
  return first ? MODEL_MAP[first] : MODEL_MAP.deepseek;
}

export function buildOpenClawConfig(profile: ProviderProfile): OpenClawConfigPatch {
  const enabled = new Set(profile.enabledProviders);

  const providers: Record<string, unknown> = {};
  if (enabled.has("deepseek")) {
    providers.deepseek = {
      adapter: "openai-compatible",
      baseURL: "https://api.deepseek.com/v1",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      models: ["deepseek-chat", "deepseek-reasoner"]
    };
  }
  if (enabled.has("openai")) {
    providers.openai = {
      adapter: "openai",
      apiKeyEnv: "OPENAI_API_KEY"
    };
  }
  if (enabled.has("anthropic")) {
    providers.anthropic = {
      adapter: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY"
    };
  }

  const fallbackModels = profile.fallbackChain
    .filter((provider) => enabled.has(provider))
    .map((provider) => FALLBACK_MODELS[provider]);

  const tools: Record<string, unknown> = {};
  if (profile.searchEnabled && enabled.has("perplexity")) {
    tools.web_search = {
      provider: "perplexity",
      model: "sonar",
      apiKeyEnv: "PERPLEXITY_API_KEY",
      enabled: true
    };
  }

  return {
    defaultModel: profile.defaultModel,
    providers: {
      ...providers,
      fallback: fallbackModels
    },
    tools
  };
}
