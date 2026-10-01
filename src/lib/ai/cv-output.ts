type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function removeGeneralSummary(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const output = { ...value };
  delete output.summary;
  return output;
}

export function withoutGeneralSummarySchema(schema: JsonRecord): JsonRecord {
  if (!isRecord(schema.properties)) return schema;
  const properties = { ...schema.properties };
  delete properties.summary;
  return { ...schema, properties };
}