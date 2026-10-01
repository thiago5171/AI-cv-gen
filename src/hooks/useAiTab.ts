import { useCallback, useEffect, useMemo, useState } from "react";
import { makeClient, friendlyError } from "../lib/ai/client";
import { extractFile, makeTextDoc } from "../lib/ai/extract";
import { distillProfile } from "../lib/ai/profile";
import { generateCv, refineCv } from "../lib/ai/generate";
import { distillProfileLocal, generateCvLocal, refineCvLocal } from "../lib/ai/local";
import { distillProfileGemini, generateCvGemini, refineCvGemini } from "../lib/ai/gemini";
import {
  distillProfileOpenRouter,
  generateCvOpenRouter,
  refineCvOpenRouter,
} from "../lib/ai/openrouter";
import { DEFAULT_MODEL } from "../lib/ai/cost";
import * as store from "../lib/ai/storage";

import { toPrettyJson } from "./useCvDocument";
import type {
  AiProvider,
  AiSettings,
  BackgroundDoc,
  ConversationTurn,
  HistoryEntry,
  TokenUsage,
} from "../lib/ai/types";

export type { AiProvider };

const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type AiStatus = { type: "ok" | "error" | "info" | "loading"; message: string };

const emptySession: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  usd: 0,
  model: DEFAULT_MODEL,
};

/**
 * State + actions for the "Com IA" tab. Generated CVs are pushed into the
 * shared CV document via `loadCv`, so the existing preview/export code renders
 * them with no new code.
 */
export function useAiTab(loadCv: (cv: unknown, message?: string) => void) {
  // localStorage is synchronous — read it lazily on first render rather than
  // in an effect (avoids a redundant re-render and set-state-in-effect).
  const [apiKey, setApiKey] = useState(() => store.loadApiKey());
  const [provider, setProviderState] = useState<AiProvider>(() => store.loadProvider());
  const [settings, setSettings] = useState<AiSettings>(() => store.loadSettings());
  const [docs, setDocs] = useState<BackgroundDoc[]>([]);
  const [profileText, setProfileText] = useState(() => {
    const p = store.loadProfile();
    return p ? toPrettyJson(p) : "";
  });
  const [hasProfile, setHasProfile] = useState(() => store.loadProfile() !== null);
  const [jobDescription, setJobDescription] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [sessionUsage, setSessionUsage] = useState<TokenUsage>(emptySession);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  /** Warns when a repeated call did not read cache. */
  const [cacheWarning, setCacheWarning] = useState(false);

  // Async IndexedDB stores load after mount.
  useEffect(() => {
    store.listDocs().then(setDocs);
    store.listHistory().then(setHistory);
  }, []);

  const totalDocTokens = useMemo(
    () => docs.reduce((sum, d) => sum + d.approxTokens, 0),
    [docs],
  );

  // ── Config persistence ──
  const updateApiKey = useCallback((key: string) => {
    setApiKey(key);
    store.saveApiKey(key);
  }, []);
  const updateSettings = useCallback((next: AiSettings) => {
    setSettings(next);
    store.saveSettings(next);
  }, []);
  const updateProvider = useCallback((next: AiProvider) => {
    setProviderState(next);
    store.saveProvider(next);
  }, []);

  const requireClient = useCallback(() => {
    if (!apiKey.trim()) throw new Error("Informe a API key da Anthropic.");
    return makeClient(apiKey.trim());
  }, [apiKey]);

  const addUsage = useCallback((usage: TokenUsage) => {
    setLastUsage(usage);
    setCacheWarning(false);
    setSessionUsage((prev) => ({
      inputTokens: prev.inputTokens + usage.inputTokens,
      outputTokens: prev.outputTokens + usage.outputTokens,
      cacheWriteTokens: prev.cacheWriteTokens + usage.cacheWriteTokens,
      cacheReadTokens: prev.cacheReadTokens + usage.cacheReadTokens,
      usd: prev.usd + usage.usd,
      model: usage.model,
    }));
  }, []);

  // ── Documents ──
  const addFiles = useCallback(async (files: FileList | File[]) => {
    setBusy(true);
    setStatus({ type: "loading", message: "Extraindo texto dos documentos..." });
    const warnings: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const { doc, warning } = await extractFile(file);
        await store.putDoc(doc);
        if (warning) warnings.push(warning);
      }
      setDocs(await store.listDocs());
      setStatus({
        type: warnings.length ? "info" : "ok",
        message: warnings.length ? warnings.join(" ") : "Documentos adicionados.",
      });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Falha na extração." });
    } finally {
      setBusy(false);
    }
  }, []);

  const addAboutText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const doc = makeTextDoc(text);
    await store.putDoc(doc);
    setDocs(await store.listDocs());
    setStatus({ type: "ok", message: "Texto adicionado ao background." });
  }, []);

  const removeDoc = useCallback(async (id: string) => {
    await store.deleteDoc(id);
    setDocs(await store.listDocs());
  }, []);

  // ── Distillation ──
  const processDocs = useCallback(async () => {
    setBusy(true);
    setStatus({ type: "loading", message: "Destilando perfil canônico (1 chamada)..." });
    try {
      const { profile, usage } =
        provider === "claude-local"
          ? await distillProfileLocal(docs, settings)
          : provider === "gemini-local"
            ? await distillProfileGemini(docs, settings)
            : provider === "openrouter-local"
              ? await distillProfileOpenRouter(docs, settings)
              : await distillProfile(requireClient(), docs, settings);
      store.saveProfile(profile);
      setProfileText(toPrettyJson(profile));
      setHasProfile(true);
      addUsage(usage);
      setStatus({ type: "ok", message: "Perfil gerado. Revise/edite o profile.json antes de gerar o CV." });
    } catch (error) {
      setStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  }, [addUsage, docs, provider, requireClient, settings]);

  const saveEditedProfile = useCallback(() => {
    try {
      const parsed = JSON.parse(profileText);
      store.saveProfile(parsed);
      setHasProfile(true);
      setStatus({ type: "ok", message: "profile.json salvo." });
    } catch {
      setStatus({ type: "error", message: "profile.json inválido — corrija o JSON." });
    }
  }, [profileText]);

  // ── Generation & refinement ──
  const runGenerate = useCallback(async () => {
    if (!jobDescription.trim()) {
      setStatus({ type: "error", message: "Cole a descrição da vaga." });
      return;
    }
    setBusy(true);
    setStatus({ type: "loading", message: "Gerando CV para a vaga..." });
    try {
      const profile = JSON.parse(profileText);
      const result =
        provider === "claude-local"
          ? await generateCvLocal(profile, jobDescription, settings)
          : provider === "gemini-local"
            ? await generateCvGemini(profile, jobDescription, settings)
            : provider === "openrouter-local"
              ? await generateCvOpenRouter(profile, jobDescription, settings)
              : await generateCv(requireClient(), profile, jobDescription, settings);
      setTurns(result.turns);
      addUsage(result.usage);
      loadCv(result.cv, "CV gerado. Veja o preview / exporte na área abaixo.");
      const entry: HistoryEntry = {
        id: uid(),
        jobDescription,
        cv: result.cv,
        turns: result.turns,
        createdAt: Date.now(),
        totalUsd: result.usage.usd,
      };
      await store.putHistory(entry);
      setHistory(await store.listHistory());
      setStatus({ type: "ok", message: "CV gerado com sucesso." });
    } catch (error) {
      setStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  }, [addUsage, jobDescription, loadCv, profileText, provider, requireClient, settings]);

  const runRefine = useCallback(
    async (instruction: string) => {
      if (!instruction.trim()) return;
      if (turns.length === 0) {
        setStatus({ type: "error", message: "Gere um CV antes de refinar." });
        return;
      }
      setBusy(true);
      setStatus({ type: "loading", message: "Refinando (reaproveita cache)..." });
      try {
        const profile = JSON.parse(profileText);
        const result =
          provider === "claude-local"
            ? await refineCvLocal(profile, turns, instruction, settings)
            : provider === "gemini-local"
              ? await refineCvGemini(profile, turns, instruction, settings)
              : provider === "openrouter-local"
                ? await refineCvOpenRouter(profile, turns, instruction, settings)
                : await refineCv(requireClient(), profile, turns, instruction, settings);
        setTurns(result.turns);
        setLastUsage(result.usage);
        // Only the Anthropic API path has a cross-call prompt cache to miss.
        setCacheWarning(provider === "anthropic-api" && !result.cacheHit);
        setSessionUsage((prev) => ({
          inputTokens: prev.inputTokens + result.usage.inputTokens,
          outputTokens: prev.outputTokens + result.usage.outputTokens,
          cacheWriteTokens: prev.cacheWriteTokens + result.usage.cacheWriteTokens,
          cacheReadTokens: prev.cacheReadTokens + result.usage.cacheReadTokens,
          usd: prev.usd + result.usage.usd,
          model: result.usage.model,
        }));
        loadCv(result.cv, "CV refinado.");
        setStatus({
          type: result.cacheHit || provider !== "anthropic-api" ? "ok" : "info",
          message: result.cacheHit
            ? "CV refinado (cache reaproveitado)."
            : provider === "anthropic-api"
              ? "CV refinado — atenção: sem leitura de cache nesta chamada."
              : "CV refinado.",
        });
      } catch (error) {
        setStatus({ type: "error", message: friendlyError(error) });
      } finally {
        setBusy(false);
      }
    },
    [loadCv, profileText, provider, requireClient, settings, turns],
  );

  // ── History ──
  const reopenHistory = useCallback(
    (entry: HistoryEntry) => {
      setJobDescription(entry.jobDescription);
      setTurns(entry.turns);
      loadCv(entry.cv, "Geração reaberta do histórico.");
    },
    [loadCv],
  );
  const duplicateHistory = useCallback((entry: HistoryEntry) => {
    setJobDescription(entry.jobDescription);
    setTurns([]);
    setStatus({ type: "info", message: "Vaga copiada. Ajuste e gere um novo CV." });
  }, []);
  const removeHistory = useCallback(async (id: string) => {
    await store.deleteHistory(id);
    setHistory(await store.listHistory());
  }, []);

  // ── Backup ──
  const exportConfig = useCallback(async (includeApiKey: boolean) => {
    const bundle = await store.exportBundle(includeApiKey);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cvgen-ai-config.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  const importConfig = useCallback(async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text());
      await store.importBundle(bundle);
      setApiKey(store.loadApiKey());
      setSettings(store.loadSettings());
      const profile = store.loadProfile();
      if (profile) {
        setProfileText(toPrettyJson(profile));
        setHasProfile(true);
      }
      setDocs(await store.listDocs());
      setHistory(await store.listHistory());
      setStatus({ type: "ok", message: "Configuração importada." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Falha ao importar." });
    }
  }, []);

  // TokenUsage already carries the computed cost fields — present it as a CostBreakdown.
  const lastCost = useMemo(
    () =>
      lastUsage
        ? {
            inputTokens: lastUsage.inputTokens,
            outputTokens: lastUsage.outputTokens,
            cacheWriteTokens: lastUsage.cacheWriteTokens,
            cacheReadTokens: lastUsage.cacheReadTokens,
            usd: lastUsage.usd,
            free: lastUsage.free,
          }
        : null,
    [lastUsage],
  );

  return {
    apiKey,
    updateApiKey,
    provider,
    updateProvider,
    settings,
    updateSettings,
    docs,
    totalDocTokens,
    addFiles,
    addAboutText,
    removeDoc,
    profileText,
    setProfileText,
    hasProfile,
    processDocs,
    saveEditedProfile,
    jobDescription,
    setJobDescription,
    runGenerate,
    runRefine,
    history,
    reopenHistory,
    duplicateHistory,
    removeHistory,
    lastUsage,
    lastCost,
    sessionUsage,
    cacheWarning,
    busy,
    status,
    exportConfig,
    importConfig,
  };
}

export type AiTabState = ReturnType<typeof useAiTab>;
