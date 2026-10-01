/** OpenRouter Free Router provider through the dev-only /api/openrouter endpoint. */

import cvSchema from "../../data/cv.schema.json";
import profileSchema from "../../data/profile.schema.json";
import { removeGeneralSummary, withoutGeneralSummarySchema } from "./cv-output";
import { sanitizeSchemaForOpenRouter } from "./schema";
import { stableStringify } from "./stableStringify";
import { estimateCost } from "./cost";
import { DISTILL_INSTRUCTIONS, GENERATE_INSTRUCTIONS, REFINE_HINT } from "./prompts";
import {
  usageFromCost,
  type AiSettings,
  type BackgroundDoc,
  type ConversationTurn,
  type TokenUsage,
} from "./types";

const CV_SCHEMA_FOR_GENERATION = withoutGeneralSummarySchema(
  cvSchema as Record<string, unknown>,
);
const CV_SCHEMA_OPENROUTER = sanitizeSchemaForOpenRouter(CV_SCHEMA_FOR_GENERATION);
const PROFILE_SCHEMA_OPENROUTER = sanitizeSchemaForOpenRouter(profileSchema as Record<string, unknown>);
const CV_SCHEMA_TEXT = JSON.stringify(CV_SCHEMA_FOR_GENERATION);

type OpenRouterResponse =
  | {
      ok: true;
      data: unknown;
      model: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        totalTokens: number;
      };
    }
  | { ok: false; error: string };

async function callOpenRouter(
  prompt: string,
  schema: Record<string, unknown>,
  model: string,
  system?: string,
): Promise<{ data: unknown; usage: TokenUsage }> {
  let res: Response;
  try {
    res = await fetch("/api/openrouter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, schema, model, system }),
    });
  } catch {
    throw new Error(
      "Endpoint local indisponível. O modo OpenRouter só funciona com 'npm run dev' rodando.",
    );
  }

  const body = (await res.json()) as OpenRouterResponse;
  if (!body.ok) throw new Error(body.error);

  const cost = estimateCost(
    {
      input_tokens: body.usage.inputTokens,
      output_tokens: body.usage.outputTokens,
      cache_read_input_tokens: body.usage.cachedTokens,
    },
    model as AiSettings["openrouterModel"],
  );
  return { data: body.data, usage: usageFromCost(cost, model as AiSettings["openrouterModel"]) };
}

function docsToText(docs: BackgroundDoc[]): string {
  return docs
    .filter((doc) => doc.text.trim())
    .map((doc) => `### ${doc.name} (${doc.kind})\n${doc.text}`)
    .join("\n\n---\n\n");
}

export async function distillProfileOpenRouter(
  docs: BackgroundDoc[],
  settings: AiSettings,
): Promise<{ profile: unknown; usage: TokenUsage }> {
  const text = docsToText(docs);
  if (!text) {
    throw new Error("Nenhum documento com texto. (PDF escaneado não é suportado no modo OpenRouter.)");
  }
  const { data, usage } = await callOpenRouter(
    `Documentos:\n${text}`,
    PROFILE_SCHEMA_OPENROUTER,
    settings.openrouterModel,
    DISTILL_INSTRUCTIONS,
  );
  return { profile: data, usage };
}

function generationResult(data: unknown, usage: TokenUsage, turns: ConversationTurn[]) {
  const cv = removeGeneralSummary(data);
  return {
    cv,
    usage,
    turns,
    cacheHit: false,
    assistantTurn: { role: "assistant" as const, content: JSON.stringify(cv) },
  };
}

export async function generateCvOpenRouter(
  profile: unknown,
  jobDescription: string,
  settings: AiSettings,
) {
  const userTurn: ConversationTurn = {
    role: "user",
    content: `Descrição da vaga:\n${jobDescription}`,
  };
  const prompt = [
    `Schema do CV (siga exatamente):\n${CV_SCHEMA_TEXT}`,
    `Perfil canônico do candidato:\n${stableStringify(profile)}`,
    userTurn.content,
  ].join("\n\n");
  const { data, usage } = await callOpenRouter(
    prompt,
    CV_SCHEMA_OPENROUTER,
    settings.openrouterModel,
    GENERATE_INSTRUCTIONS,
  );
  const base = generationResult(data, usage, []);
  return { ...base, turns: [userTurn, base.assistantTurn] };
}

export async function refineCvOpenRouter(
  profile: unknown,
  priorTurns: ConversationTurn[],
  instruction: string,
  settings: AiSettings,
) {
  const lastCv = [...priorTurns].reverse().find((turn) => turn.role === "assistant")?.content ?? "{}";
  const userTurn: ConversationTurn = {
    role: "user",
    content: `${REFINE_HINT}\n\nInstrução: ${instruction}`,
  };
  const prompt = [
    `Schema do CV (siga exatamente):\n${CV_SCHEMA_TEXT}`,
    `Perfil canônico do candidato:\n${stableStringify(profile)}`,
    `CV atual:\n${lastCv}`,
    userTurn.content,
  ].join("\n\n");
  const { data, usage } = await callOpenRouter(
    prompt,
    CV_SCHEMA_OPENROUTER,
    settings.openrouterModel,
    GENERATE_INSTRUCTIONS,
  );
  const base = generationResult(data, usage, []);
  return { ...base, turns: [...priorTurns, userTurn, base.assistantTurn] };
}