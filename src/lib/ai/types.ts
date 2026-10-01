import type { CostBreakdown } from "./cost";

export type AnthropicModelId = "claude-sonnet-5" | "claude-opus-5";
/** Only models that are free on the Gemini API free tier. */
export type GeminiModelId = "gemini-3.8-flash" | "gemini-2.5-pro";
/** OpenRouter selects a compatible free upstream model at request time. */
export type OpenRouterModelId = "openrouter/free";
export type AiModelId = AnthropicModelId | GeminiModelId | OpenRouterModelId;
export type Effort = "low" | "medium" | "high";

/** Local API providers call dev-only endpoints and keep their keys off the browser. */
export type AiProvider = "claude-local" | "anthropic-api" | "gemini-local" | "openrouter-local";

// Each provider keeps its own model so switching providers can never select an
// id the other API would reject.
export type AiSettings = {
  model: AnthropicModelId;
  geminiModel: GeminiModelId;
  openrouterModel: OpenRouterModelId;
  effort: Effort;
};

/** A background document the user uploaded, stored in IndexedDB. */
export type BackgroundDoc = {
  id: string;
  name: string;
  kind: "pdf" | "docx" | "md" | "txt" | "text";
  /** Extracted plain text — what actually goes to the model. Compact & cheap. */
  text: string;
  /** Approx token count of `text` (chars / 4). */
  approxTokens: number;
  /** Original file bytes (base64) — kept ONLY for scanned PDFs with no text
   *  layer, so distillation can fall back to sending the PDF as a document. */
  fallbackPdfBase64?: string;
  addedAt: number;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  usd: number;
  model: AiModelId;
  /** True when the call ran on a no-charge tier, so `usd: 0` is a fact and not an estimate. */
  free?: boolean;
};

export function usageFromCost(cost: CostBreakdown, model: AiModelId): TokenUsage {
  return {
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    cacheWriteTokens: cost.cacheWriteTokens,
    cacheReadTokens: cost.cacheReadTokens,
    usd: cost.usd,
    model,
    free: cost.free,
  };
}

/** One generation (+ any refinements) saved to history. */
export type HistoryEntry = {
  id: string;
  jobDescription: string;
  /** Final CV JSON produced. */
  cv: unknown;
  /** Full message turns (job + refinements) for reopening the conversation. */
  turns: ConversationTurn[];
  createdAt: number;
  totalUsd: number;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  /** For user turns: the instruction text. For assistant: serialized CV JSON. */
  content: string;
};
