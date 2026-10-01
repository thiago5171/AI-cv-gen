/**
 * storage.ts
 * Persistence for the AI tab.
 *  - localStorage: small, hot config (API key, model/effort, profile.json).
 *  - IndexedDB (via idb): background docs and generation history — can exceed
 *    localStorage's ~5 MB limit.
 *  - Export/import: the whole configuration as one JSON file for backup.
 */

import { openDB, type IDBPDatabase } from "idb";
import { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL, DEFAULT_OPENROUTER_MODEL } from "./cost";
import type {
  AiProvider,
  AiSettings,
  BackgroundDoc,
  Effort,
  HistoryEntry,
} from "./types";

// ─── localStorage ──────────────────────────────────────────────────────────

const LS = {
  apiKey: "cvgen.ai.apiKey",
  provider: "cvgen.ai.provider",
  model: "cvgen.ai.model",
  geminiModel: "cvgen.ai.geminiModel",
  openrouterModel: "cvgen.ai.openrouterModel",
  effort: "cvgen.ai.effort",
  profile: "cvgen.ai.profile",
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — ignore */
  }
}

export function loadApiKey(): string {
  return lsGet(LS.apiKey) ?? "";
}
export function saveApiKey(key: string): void {
  lsSet(LS.apiKey, key || null);
}

const PROVIDERS: AiProvider[] = ["claude-local", "anthropic-api", "gemini-local", "openrouter-local"];

export function loadProvider(): AiProvider {
  const raw = lsGet(LS.provider);
  // Values written before the Gemini provider existed.
  if (raw === "local") return "claude-local";
  if (raw === "api") return "anthropic-api";
  return PROVIDERS.find((p) => p === raw) ?? "claude-local";
}
export function saveProvider(provider: AiProvider): void {
  lsSet(LS.provider, provider);
}

export function loadSettings(): AiSettings {
  const model = (lsGet(LS.model) as AiSettings["model"]) || DEFAULT_MODEL;
  const geminiModel = (lsGet(LS.geminiModel) as AiSettings["geminiModel"]) || DEFAULT_GEMINI_MODEL;
  const openrouterModel =
    (lsGet(LS.openrouterModel) as AiSettings["openrouterModel"]) || DEFAULT_OPENROUTER_MODEL;
  const effort = (lsGet(LS.effort) as Effort) || "medium";
  return { model, geminiModel, openrouterModel, effort };
}
export function saveSettings(settings: AiSettings): void {
  lsSet(LS.model, settings.model);
  lsSet(LS.geminiModel, settings.geminiModel);
  lsSet(LS.openrouterModel, settings.openrouterModel);
  lsSet(LS.effort, settings.effort);
}

export function loadProfile(): unknown | null {
  const raw = lsGet(LS.profile);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function saveProfile(profile: unknown | null): void {
  lsSet(LS.profile, profile === null ? null : JSON.stringify(profile));
}

// ─── IndexedDB ─────────────────────────────────────────────────────────────

const DB_NAME = "cvgen-ai";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("docs")) {
          database.createObjectStore("docs", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("history")) {
          database.createObjectStore("history", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function listDocs(): Promise<BackgroundDoc[]> {
  const all = (await (await db()).getAll("docs")) as BackgroundDoc[];
  return all.sort((a, b) => a.addedAt - b.addedAt);
}
export async function putDoc(doc: BackgroundDoc): Promise<void> {
  await (await db()).put("docs", doc);
}
export async function deleteDoc(id: string): Promise<void> {
  await (await db()).delete("docs", id);
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = (await (await db()).getAll("history")) as HistoryEntry[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function putHistory(entry: HistoryEntry): Promise<void> {
  await (await db()).put("history", entry);
}
export async function deleteHistory(id: string): Promise<void> {
  await (await db()).delete("history", id);
}

// ─── Export / Import ───────────────────────────────────────────────────────

export type ConfigBundle = {
  version: 1;
  settings: AiSettings;
  profile: unknown | null;
  docs: BackgroundDoc[];
  history: HistoryEntry[];
  // API keys intentionally NOT included by default — they are secrets. The
  // Local-provider keys are never here: they live only in the dev server's env.
  apiKey?: string;
};

export async function exportBundle(includeApiKey: boolean): Promise<ConfigBundle> {
  return {
    version: 1,
    settings: loadSettings(),
    profile: loadProfile(),
    docs: await listDocs(),
    history: await listHistory(),
    ...(includeApiKey ? { apiKey: loadApiKey() } : {}),
  };
}

export async function importBundle(bundle: ConfigBundle): Promise<void> {
  if (bundle.version !== 1) throw new Error("Versão de backup não suportada.");
  // Older backups may not have the provider-specific model settings.
  saveSettings({
    model: bundle.settings?.model ?? DEFAULT_MODEL,
    geminiModel: bundle.settings?.geminiModel ?? DEFAULT_GEMINI_MODEL,
    openrouterModel: bundle.settings?.openrouterModel ?? DEFAULT_OPENROUTER_MODEL,
    effort: bundle.settings?.effort ?? "medium",
  });
  saveProfile(bundle.profile ?? null);
  if (bundle.apiKey) saveApiKey(bundle.apiKey);

  const database = await db();
  const tx = database.transaction(["docs", "history"], "readwrite");
  await tx.objectStore("docs").clear();
  await tx.objectStore("history").clear();
  for (const doc of bundle.docs ?? []) await tx.objectStore("docs").put(doc);
  for (const entry of bundle.history ?? []) await tx.objectStore("history").put(entry);
  await tx.done;
}
