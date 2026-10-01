/**
 * cost.ts
 * Token pricing and cost estimation for the models offered in the AI tab.
 * Anthropic prices are USD per 1M tokens (first-party API rates); cache writes
 * bill at ~1.25x the input rate, cache reads at ~0.1x. Gemini free-tier models
 * and the OpenRouter Free Router price at zero and are flagged `free` instead
 * of being estimated.
 */

import type { AiModelId, AnthropicModelId, GeminiModelId, OpenRouterModelId } from "./types";

export type ModelInfo = {
  id: AiModelId;
  label: string;
  inputPerM: number;
  outputPerM: number;
  free?: boolean;
};

// Keep the cheaper model first — it is the default.
export const MODELS: ModelInfo[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5 (mais barato)", inputPerM: 2, outputPerM: 10 },
  { id: "claude-opus-5", label: "Opus 5 (mais capaz)", inputPerM: 5, outputPerM: 25 },
];

// Free tier only. Gemini 3.x Pro is paid-only and is deliberately absent.
export const GEMINI_MODELS: ModelInfo[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (rápido)", inputPerM: 0, outputPerM: 0, free: true },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (mais capaz)", inputPerM: 0, outputPerM: 0, free: true },
];

// The router selects a currently available free model that supports the request.
export const OPENROUTER_MODELS: ModelInfo[] = [
  { id: "openrouter/free", label: "Free Router (automático)", inputPerM: 0, outputPerM: 0, free: true },
];

export const DEFAULT_MODEL: AnthropicModelId = "claude-sonnet-5";
export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.8-flash";
export const DEFAULT_OPENROUTER_MODEL: OpenRouterModelId = "openrouter/free";

const ALL_MODELS = [...MODELS, ...GEMINI_MODELS, ...OPENROUTER_MODELS];

export function modelInfo(id: AiModelId): ModelInfo {
  return ALL_MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type CostBreakdown = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  usd: number;
  free?: boolean;
};

export function estimateCost(usage: UsageLike, model: AiModelId): CostBreakdown {
  const info = modelInfo(model);
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const usd =
    (inputTokens * info.inputPerM +
      cacheWriteTokens * info.inputPerM * 1.25 +
      cacheReadTokens * info.inputPerM * 0.1 +
      outputTokens * info.outputPerM) /
    1_000_000;

  return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, usd, free: info.free };
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
