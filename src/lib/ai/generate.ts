/**
 * generate.ts
 * CV generation and refinement against a fixed profile.
 *
 * Prompt layout (order matters for caching — stable content first, the
 * cache_control breakpoint after the profile, variable content last):
 *
 *   system: [ INSTRUCTIONS + CV schema   (frozen) ,
 *             stableStringify(profile)   (cache_control ephemeral 1h) ]
 *   messages: [ job description, refinements... ]  (variable, after breakpoint)
 *
 * Nothing volatile (dates, UUIDs) goes before the breakpoint, and the profile
 * is serialized with sorted keys, so repeated calls read from cache. Verify via
 * usage.cache_read_input_tokens.
 */

import type Anthropic from "@anthropic-ai/sdk";
import cvSchema from "../../data/cv.schema.json";
import { removeGeneralSummary, withoutGeneralSummarySchema } from "./cv-output";
import { sanitizeSchemaForApi } from "./schema";
import { stableStringify } from "./stableStringify";
import { stopReasonError } from "./client";
import { estimateCost } from "./cost";
import { collectText } from "./message";
import { GENERATE_INSTRUCTIONS, REFINE_HINT } from "./prompts";
import {
  usageFromCost,
  type AiSettings,
  type ConversationTurn,
  type TokenUsage,
} from "./types";

const CV_SCHEMA_FOR_GENERATION = withoutGeneralSummarySchema(
  cvSchema as Record<string, unknown>,
);

const CV_FORMAT = {
  type: "json_schema" as const,
  schema: sanitizeSchemaForApi(CV_SCHEMA_FOR_GENERATION),
};

const CV_SCHEMA_TEXT = JSON.stringify(CV_SCHEMA_FOR_GENERATION);

function buildSystem(profile: unknown): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: `${GENERATE_INSTRUCTIONS}\n\nSchema do CV (siga exatamente):\n${CV_SCHEMA_TEXT}`,
    },
    {
      type: "text",
      text: `Perfil canônico do candidato:\n${stableStringify(profile)}`,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
}

function toMessages(turns: ConversationTurn[]): Anthropic.MessageParam[] {
  return turns.map((t) => ({ role: t.role, content: t.content }));
}

export type GenerationResult = {
  cv: unknown;
  /** The assistant turn (serialized CV) to append to the conversation. */
  assistantTurn: ConversationTurn;
  usage: TokenUsage;
  /** True if this call read from the prompt cache. */
  cacheHit: boolean;
};

async function run(
  client: Anthropic,
  profile: unknown,
  turns: ConversationTurn[],
  settings: AiSettings,
): Promise<GenerationResult> {
  const stream = client.messages.stream({
    model: settings.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: settings.effort, format: CV_FORMAT },
    system: buildSystem(profile),
    messages: toMessages(turns),
  });

  const message = await stream.finalMessage();
  const err = stopReasonError(message.stop_reason);
  if (err) throw new Error(err);

  const raw = collectText(message);
  let cv: unknown;
  try {
    cv = removeGeneralSummary(JSON.parse(raw));
  } catch {
    throw new Error("O modelo não retornou um JSON de CV válido. Tente novamente.");
  }

  const cost = estimateCost(message.usage, settings.model);
  return {
    cv,
    assistantTurn: { role: "assistant", content: JSON.stringify(cv) },
    usage: usageFromCost(cost, settings.model),
    cacheHit: (message.usage.cache_read_input_tokens ?? 0) > 0,
  };
}

/** First generation from a job description. Returns the new conversation turns. */
export async function generateCv(
  client: Anthropic,
  profile: unknown,
  jobDescription: string,
  settings: AiSettings,
): Promise<GenerationResult & { turns: ConversationTurn[] }> {
  const userTurn: ConversationTurn = {
    role: "user",
    content: `Descrição da vaga:\n${jobDescription}`,
  };
  const result = await run(client, profile, [userTurn], settings);
  return { ...result, turns: [userTurn, result.assistantTurn] };
}

/** Refinement: continues the existing multi-turn conversation (cache reuse). */
export async function refineCv(
  client: Anthropic,
  profile: unknown,
  priorTurns: ConversationTurn[],
  instruction: string,
  settings: AiSettings,
): Promise<GenerationResult & { turns: ConversationTurn[] }> {
  const userTurn: ConversationTurn = {
    role: "user",
    content: `${REFINE_HINT}\n\nInstrução: ${instruction}`,
  };
  const turns = [...priorTurns, userTurn];
  const result = await run(client, profile, turns, settings);
  return { ...result, turns: [...turns, result.assistantTurn] };
}
