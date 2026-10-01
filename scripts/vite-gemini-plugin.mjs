/**
 * vite-gemini-plugin.mjs
 * Dev-only Vite middleware exposing POST /api/gemini.
 *
 * The Gemini API key is read from the environment (.env.local) and stays in the
 * Node process — it is never sent to the browser, unlike the Anthropic provider
 * whose key lives in localStorage. Only models that are free of charge on the
 * API free tier are accepted, so a misconfigured client cannot silently opt the
 * user into a paid model.
 *
 * Local dev only; a static production build has no server to hold the key.
 *
 * Request  body: { prompt: string, schema: object, model: string, system?: string }
 * Response body: { ok: true, data: <parsed JSON>, usage, model }
 *              | { ok: false, error: string }
 */

import { GoogleGenAI } from "@google/genai";
import { loadEnv } from "vite";

const ALLOWED_MODELS = new Set(["gemini-3.8-flash", "gemini-2.5-pro"]);
const TIMEOUT_MS = 180_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/** Map SDK/API failures to messages that are safe and actionable for the user. */
function friendlyError(error) {
  const message = error?.message ?? String(error);
  const status = error?.status ?? error?.code;

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) {
    return (
      "Limite do free tier atingido para este modelo. Aguarde a renovação da cota " +
      "ou troque de modelo (Flash ↔ 2.5 Pro)."
    );
  }
  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED/i.test(message)) {
    return "GEMINI_API_KEY inválida ou sem acesso a este modelo. Gere uma nova chave no Google AI Studio.";
  }
  if (status === 404 || /not found|NOT_FOUND/i.test(message)) {
    return "Modelo indisponível para esta chave. Tente o Gemini 3.8 Flash.";
  }
  if (status === 400 || /INVALID_ARGUMENT/i.test(message)) {
    return `Requisição inválida para a API Gemini: ${message}`;
  }
  return `Erro da API Gemini: ${message}`;
}

async function runGemini(client, { prompt, schema, model, system }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        abortSignal: controller.signal,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        ...(system ? { systemInstruction: system } : {}),
      },
    });

    const text = response.text;
    if (!text) {
      return { ok: false, error: "O Gemini não retornou conteúdo. Tente novamente." };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: "O Gemini não retornou um JSON válido. Tente novamente." };
    }

    const u = response.usageMetadata ?? {};
    return {
      ok: true,
      data,
      model,
      usage: {
        inputTokens: u.promptTokenCount ?? 0,
        outputTokens: u.candidatesTokenCount ?? 0,
        cachedTokens: u.cachedContentTokenCount ?? 0,
        totalTokens: u.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: "Tempo esgotado ao chamar a API Gemini (timeout)." };
    }
    return { ok: false, error: friendlyError(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function geminiApiPlugin() {
  let apiKey = "";

  return {
    name: "gemini-api-endpoint",
    apply: "serve", // dev only
    configResolved(config) {
      // loadEnv reads .env / .env.local without exposing the key to client code.
      const env = loadEnv(config.mode, config.envDir || process.cwd(), "");
      apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    },
    configureServer(server) {
      server.middlewares.use("/api/gemini", async (req, res, next) => {
        if (req.method !== "POST") return next();
        res.setHeader("Content-Type", "application/json");

        if (!apiKey) {
          res.statusCode = 503;
          res.end(
            JSON.stringify({
              ok: false,
              error:
                "GEMINI_API_KEY não configurada. Crie uma chave gratuita no Google AI Studio, " +
                "coloque em .env.local e reinicie o 'npm run dev'.",
            }),
          );
          return;
        }

        try {
          const body = await readBody(req);
          if (!body.prompt || !body.schema) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: "prompt e schema são obrigatórios." }));
            return;
          }
          if (!ALLOWED_MODELS.has(body.model)) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: `Modelo não permitido: ${body.model ?? "(vazio)"}. Use um dos modelos gratuitos.`,
              }),
            );
            return;
          }

          const client = new GoogleGenAI({ apiKey });
          const result = await runGemini(client, body);
          res.statusCode = result.ok ? 200 : 500;
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: e?.message ?? "Erro interno." }));
        }
      });
    },
  };
}
