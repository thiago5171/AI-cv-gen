/**
 * gemini.ts
 * "Gemini (local)" provider — mirrors local.ts, but instead of shelling out to
 * a CLI it posts to the dev-server endpoint that holds the Gemini API key.
 *
 * Runs on the Gemini API free tier, so there is no charge and no credit balance
 * to manage; usage is reported in tokens and priced at zero. There is no
 * cross-call prompt cache here, so refinements resend the current CV.
 * Works only under `npm run dev` (the static build has no server).
 */

import cvSchema from "../../data/cv.schema.json";
import profileSchema from "../../data/profile.schema.json";
import { removeGeneralSummary, withoutGeneralSummarySchema } from "./cv-output";
import { sanitizeSchemaForGemini } from "./schema";
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
const CV_SCHEMA_GEMINI = sanitizeSchemaForGemini(CV_SCHEMA_FOR_GENERATION);
const PROFILE_SCHEMA_GEMINI = sanitizeSchemaForGemini(profileSchema as Record<string, unknown>);
const CV_SCHEMA_TEXT = JSON.stringify(CV_SCHEMA_FOR_GENERATION);

type GeminiResponse =
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

async function callGemini(
  prompt: string,
  schema: Record<string, unknown>,
  model: string,
  system?: string,
): Promise<{ data: unknown; usage: TokenUsage }> {
  let res: Response;
  try {
    res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, schema, model, system }),
    });
  } catch {
    throw new Error(
      "Endpoint local indisponível. O modo Gemini só funciona com 'npm run dev' rodando.",
    );
  }

  const body = (await res.json()) as GeminiResponse;
  if (!body.ok) throw new Error(body.error);

  const cost = estimateCost(
    {
      input_tokens: body.usage.inputTokens,
      output_tokens: body.usage.outputTokens,
      cache_read_input_tokens: body.usage.cachedTokens,
    },
    model as AiSettings["geminiModel"],
  );

  return { data: body.data, usage: usageFromCost(cost, model as AiSettings["geminiModel"]) };
}

function docsToText(docs: BackgroundDoc[]): string {
  return docs
    .filter((d) => d.text.trim())
    .map((d) => `### ${d.name} (${d.kind})\n${d.text}`)
    .join("\n\n---\n\n");
}

// ─── Distillation ──────────────────────────────────────────────────────────

export async function distillProfileGemini(
  docs: BackgroundDoc[],
  settings: AiSettings,
): Promise<{ profile: unknown; usage: TokenUsage }> {
  const text = docsToText(docs);
  if (!text) {
    throw new Error("Nenhum documento com texto. (PDF escaneado não é suportado no modo Gemini.)");
  }
  const { data, usage } = await callGemini(
    `Documentos:\n${text}`,
    PROFILE_SCHEMA_GEMINI,
    settings.geminiModel,
    DISTILL_INSTRUCTIONS,
  );
  return { profile: data, usage };
}

// ─── Generation & refinement ───────────────────────────────────────────────

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

export async function generateCvGemini(
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

  const { data, usage } = await callGemini(
    prompt,
    CV_SCHEMA_GEMINI,
    settings.geminiModel,
    GENERATE_INSTRUCTIONS,
  );
  const base = generationResult(data, usage, []);
  return { ...base, turns: [userTurn, base.assistantTurn] };
}

export async function refineCvGemini(
  profile: unknown,
  priorTurns: ConversationTurn[],
  instruction: string,
  settings: AiSettings,
) {
  const lastCv = [...priorTurns].reverse().find((t) => t.role === "assistant")?.content ?? "{}";
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

  const { data, usage } = await callGemini(
    prompt,
    CV_SCHEMA_GEMINI,
    settings.geminiModel,
    GENERATE_INSTRUCTIONS,
  );
  const base = generationResult(data, usage, []);
  return { ...base, turns: [...priorTurns, userTurn, base.assistantTurn] };
}
