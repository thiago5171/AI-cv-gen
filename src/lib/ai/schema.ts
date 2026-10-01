/**
 * schema.ts
 * Prepares JSON Schemas for the structured-output APIs. Each vendor accepts a
 * different subset, so the strip lists differ:
 *
 *  - Anthropic: no validation keywords (`minLength`, `minItems`, `minimum`, …)
 *    and no union `type` arrays; requires `additionalProperties: false`.
 *  - Gemini: keeps `minItems`/`maximum`/`format`/`title` and supports union
 *    `type` arrays, but does not document `minLength`/`pattern`/`multipleOf`.
 *  - OpenRouter Free Router: can select different structured-output providers,
 *    so it uses the conservative Anthropic-compatible subset.
 *
 * AJV keeps using the original schema for local validation; this only affects
 * the copy sent to the model.
 *
 * The output is deterministic (keys walked in place) so the serialized schema
 * stays byte-stable across calls — required for prompt caching.
 */

const STRIP_KEYS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "multipleOf",
  "pattern",
  "$schema",
  "title",
  "format",
]);

const GEMINI_STRIP_KEYS = new Set([
  "minLength",
  "maxLength",
  "multipleOf",
  "pattern",
  "$schema",
]);

const OPENROUTER_STRIP_KEYS = new Set(STRIP_KEYS);

type JsonSchema = Record<string, unknown>;

export function sanitizeSchemaForApi(schema: JsonSchema): JsonSchema {
  return walk(schema, STRIP_KEYS, true) as JsonSchema;
}

export function sanitizeSchemaForGemini(schema: JsonSchema): JsonSchema {
  return walk(schema, GEMINI_STRIP_KEYS, false) as JsonSchema;
}

export function sanitizeSchemaForOpenRouter(schema: JsonSchema): JsonSchema {
  return walk(schema, OPENROUTER_STRIP_KEYS, true) as JsonSchema;
}

function walk(node: unknown, strip: Set<string>, collapseTypeArrays: boolean): unknown {
  if (Array.isArray(node)) return node.map((n) => walk(n, strip, collapseTypeArrays));
  if (node === null || typeof node !== "object") return node;

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node as JsonSchema)) {
    if (strip.has(key)) continue;

    // Union type arrays (e.g. ["string", "number"]) are unsupported — collapse
    // to the first type, which for our schemas is always the primary form.
    if (collapseTypeArrays && key === "type" && Array.isArray(value)) {
      out[key] = value[0];
      continue;
    }

    out[key] = walk(value, strip, collapseTypeArrays);
  }
  return out;
}
