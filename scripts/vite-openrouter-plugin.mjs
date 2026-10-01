/** Dev-only Vite middleware for structured responses from OpenRouter Free Router. */

import { OpenRouter } from "@openrouter/sdk";
import { loadEnv } from "vite";

const FREE_ROUTER_MODEL = "openrouter/free";
const TIMEOUT_MS = 180_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function statusFrom(error) {
  const status = error?.statusCode ?? error?.status ?? error?.response?.status;
  return typeof status === "number" ? status : null;
}

function friendlyError(error) {
  const status = statusFrom(error);
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403 || /unauthorized|forbidden|api key/i.test(message)) {
    return { status: status ?? 401, error: "OPENROUTER_API_KEY inválida ou sem permissão." };
  }
  if (status === 402 || /insufficient credits|payment required/i.test(message)) {
    return {
      status: 402,
      error: "A conta OpenRouter está bloqueada por saldo ou limite. Verifique a conta antes de tentar de novo.",
    };
  }
  if (status === 429 || /rate limit|quota/i.test(message)) {
    return {
      status: 429,
      error: "Limite de requisições gratuitas do OpenRouter atingido. Aguarde e tente novamente.",
    };
  }
  if (status === 503 || status === 529 || /unavailable|overloaded|no available model/i.test(message)) {
    return {
      status: status ?? 503,
      error: "Nenhum modelo gratuito compatível está disponível agora. Aguarde alguns minutos e tente novamente.",
    };
  }
  if (status === 400 || status === 422 || /schema|response format|invalid request/i.test(message)) {
    return {
      status: status ?? 400,
      error: "O OpenRouter recusou o schema ou a requisição. Tente novamente mais tarde.",
    };
  }
  return { status: status ?? 502, error: "Falha temporária ao chamar o OpenRouter." };
}

async function runOpenRouter(client, { prompt, schema, model, system }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.chat.send(
      {
        chatRequest: {
          model,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
          responseFormat: {
            type: "json_schema",
            jsonSchema: { name: "cvgen_response", strict: true, schema },
          },
          provider: { requireParameters: true },
          plugins: [{ id: "response-healing" }],
          stream: false,
        },
      },
      { fetchOptions: { signal: controller.signal } },
    );

    if (typeof ReadableStream !== "undefined" && response instanceof ReadableStream) {
      return { ok: false, status: 502, error: "O OpenRouter retornou um stream inesperado." };
    }

    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, status: 502, error: "O OpenRouter não retornou conteúdo." };
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch {
      return { ok: false, status: 502, error: "O OpenRouter não retornou um JSON válido." };
    }

    const usage = response.usage;
    return {
      ok: true,
      data,
      model: response.model ?? model,
      usage: {
        inputTokens: usage?.promptTokens ?? 0,
        outputTokens: usage?.completionTokens ?? 0,
        cachedTokens: usage?.promptTokensDetails?.cachedTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
      },
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, status: 504, error: "Tempo esgotado ao chamar o OpenRouter." };
    }
    return { ok: false, ...friendlyError(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function openrouterApiPlugin() {
  let apiKey = "";

  return {
    name: "openrouter-api-endpoint",
    apply: "serve",
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), "");
      apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "";
    },
    configureServer(server) {
      server.middlewares.use("/api/openrouter", async (req, res, next) => {
        if (req.method !== "POST") return next();
        res.setHeader("Content-Type", "application/json");

        try {
          const body = await readBody(req);
          if (
            typeof body.prompt !== "string" ||
            !body.prompt ||
            body.schema === null ||
            typeof body.schema !== "object" ||
            Array.isArray(body.schema)
          ) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: "prompt e schema são obrigatórios." }));
            return;
          }
          if (body.model !== FREE_ROUTER_MODEL) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: "Modelo não permitido. Este modo aceita somente o OpenRouter Free Router.",
              }),
            );
            return;
          }
          if (!apiKey) {
            res.statusCode = 503;
            res.end(
              JSON.stringify({
                ok: false,
                error:
                  "OPENROUTER_API_KEY não configurada. Adicione-a ao .env.local e reinicie o npm run dev.",
              }),
            );
            return;
          }

          const result = await runOpenRouter(new OpenRouter({ apiKey }), body);
          res.statusCode = result.ok ? 200 : result.status;
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "Corpo da requisição inválido." }));
        }
      });
    },
  };
}