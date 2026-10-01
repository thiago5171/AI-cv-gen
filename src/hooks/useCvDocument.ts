import { useCallback, useState } from "react";
import { sampleFull, sampleMinimal } from "../data/samples";
import {
  buildDocxBlob,
  downloadBlob,
  downloadPdfFromHtml,
} from "../lib/documents";
import { buildPrompt } from "../lib/prompt";
import { getTemplatePath, languageOptions } from "../lib/templates";
import { validateCvJson, type ValidationResult } from "../lib/validation";
import { renderCvHtml, type CvData, type CvLanguage } from "../lib/cv-renderer";
import { injectHtml } from "../lib/redteam";

export type Status = {
  type: "ok" | "error" | "info" | "loading";
  message: string;
};

export const toPrettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const filenameTemplate = (import.meta.env.VITE_CV_FILENAME?.trim() || "cv")
  .replace(/[\\/:*?"<>|]+/g, "-")
  .replace(/\.(docx|pdf|html)$/i, "") || "cv";

function exportFilename(language: CvLanguage, extension: "docx" | "pdf" | "html"): string {
  const languageCode = language === "en-US" ? "en" : "pt";
  const base = /\{lang\}/i.test(filenameTemplate)
    ? filenameTemplate.replace(/\{lang\}/gi, languageCode)
    : `${filenameTemplate}-${languageCode}`;
  return `${base}.${extension}`;
}

/**
 * Owns the CV document state (JSON text, language, validation, preview) and
 * the export handlers. Shared by the Manual and AI tabs so both work on the
 * same document and the same preview/export code.
 */
export function useCvDocument() {
  const [language, setLanguage] = useState<CvLanguage>(
    (languageOptions[0]?.id as CvLanguage) ?? "pt-BR",
  );
  const [jsonText, setJsonTextRaw] = useState(toPrettyJson(sampleFull));
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [renderErrors, setRenderErrors] = useState<string[] | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const templatePath = getTemplatePath(language);
  const templateReady = Boolean(templatePath);

  const setJsonText = useCallback((value: string) => {
    setJsonTextRaw(value);
    setPreviewHtml(null);
  }, []);

  const changeLanguage = useCallback((value: CvLanguage) => {
    setLanguage(value);
    setPreviewHtml(null);
  }, []);

  // ─── Validation ────────────────────────────────────────────────────────────

  const runValidation = useCallback((): ValidationResult => {
    setRenderErrors(null);
    const result = validateCvJson(jsonText);
    setValidation(result);
    setStatus(
      result.ok
        ? { type: "ok", message: "JSON validado com sucesso." }
        : { type: "error", message: "Revise os erros abaixo." },
    );
    return result;
  }, [jsonText]);

  // ─── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = useCallback(() => {
    const result = validateCvJson(jsonText);
    setValidation(result);
    if (!result.ok) {
      setStatus({ type: "error", message: "Corrija os erros para ver o preview." });
      setPreviewHtml(null);
      return;
    }
    let html = renderCvHtml(result.data as CvData, language);
    if (result.injection) html = injectHtml(html, result.injection);
    setPreviewHtml(html);
    setStatus({
      type: result.injection ? "info" : "ok",
      message: result.injection
        ? `Preview atualizado. ⚠ Modo red-team: payload oculto (${result.injection.vector}).`
        : "Preview atualizado.",
    });
  }, [jsonText, language]);

  // ─── Format ────────────────────────────────────────────────────────────────

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonTextRaw(toPrettyJson(parsed));
      setStatus({ type: "ok", message: "JSON formatado." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON invalido";
      setStatus({ type: "error", message });
    }
  }, [jsonText]);

  // ─── Generate DOCX ─────────────────────────────────────────────────────────

  const handleGenerateDocx = useCallback(async () => {
    const result = runValidation();
    if (!result.ok) return;

    const data = result.data as CvData;
    setIsGenerating(true);
    setRenderErrors(null);

    // Try docxtemplater first (if template has placeholders)
    if (templatePath) {
      setStatus({ type: "loading", message: "Gerando DOCX via template..." });
      const docxResult = await buildDocxBlob(
        templatePath,
        data as unknown as Record<string, unknown>,
        result.injection ?? null,
      );

      if (!("error" in docxResult)) {
        downloadBlob(docxResult.blob, exportFilename(language, "docx"));
        setStatus({
          type: result.injection ? "info" : "ok",
          message: result.injection
            ? `DOCX gerado. ⚠ Modo red-team: payload oculto (${result.injection.vector}). Não envie a empregadores.`
            : "DOCX gerado e baixado.",
        });
        setIsGenerating(false);
        return;
      }

      // If docxtemplater failed (no placeholders in template), fall through to HTML
      setRenderErrors([
        "Template sem placeholders — gerando DOCX via HTML (layout simplificado).",
        docxResult.error.message,
      ]);
    }

    // Fallback: generate via HTML → Blob (plain HTML download as alternative)
    setStatus({
      type: "info",
      message: "Gerando versão HTML do CV (adicione placeholders ao template para DOCX fiel).",
    });

    const html = renderCvHtml(data, language);
    const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
  downloadBlob(htmlBlob, exportFilename(language, "html"));
    setStatus({
      type: "ok",
      message: "CV exportado como HTML. Abra no browser e use Ctrl+P para imprimir como DOCX/PDF.",
    });
    setIsGenerating(false);
  }, [language, runValidation, templatePath]);

  // ─── Generate PDF ──────────────────────────────────────────────────────────

  const handleGeneratePdf = useCallback(async () => {
    const result = runValidation();
    if (!result.ok) return;

    const data = result.data as CvData;
    setIsGenerating(true);
    setRenderErrors(null);
    setStatus({ type: "loading", message: "Gerando PDF..." });

    try {
      const html = renderCvHtml(data, language);
      await downloadPdfFromHtml(
        html,
        exportFilename(language, "pdf"),
        result.injection ?? null,
      );
      setStatus({
        type: result.injection ? "info" : "ok",
        message: result.injection
          ? `PDF gerado. ⚠ Modo red-team: payload oculto (${result.injection.vector}). Não envie a empregadores.`
          : "PDF gerado e baixado com sucesso.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao gerar PDF.";
      setRenderErrors([message]);
      setStatus({ type: "error", message });
    } finally {
      setIsGenerating(false);
    }
  }, [language, runValidation]);

  // ─── Copy Prompt ───────────────────────────────────────────────────────────

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      setStatus({ type: "ok", message: "Prompt copiado para a área de transferência." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao copiar prompt";
      setStatus({ type: "error", message });
    }
  }, []);

  // ─── Load samples ──────────────────────────────────────────────────────────

  const loadSample = useCallback((variant: "minimal" | "full") => {
    const value = variant === "minimal" ? sampleMinimal : sampleFull;
    setJsonTextRaw(toPrettyJson(value));
    setPreviewHtml(null);
    setValidation(null);
    setStatus({ type: "info", message: `Exemplo ${variant} carregado.` });
  }, []);

  /** Replace the document with a CV object (used by the AI tab). */
  const loadCv = useCallback((cv: unknown, message?: string) => {
    setJsonTextRaw(toPrettyJson(cv));
    setPreviewHtml(null);
    setValidation(null);
    if (message) setStatus({ type: "ok", message });
  }, []);

  return {
    language,
    changeLanguage,
    jsonText,
    setJsonText,
    validation,
    status,
    setStatus,
    renderErrors,
    previewHtml,
    closePreview: () => setPreviewHtml(null),
    isGenerating,
    templateReady,
    runValidation,
    handlePreview,
    handleFormat,
    handleGenerateDocx,
    handleGeneratePdf,
    handleCopyPrompt,
    loadSample,
    loadCv,
  };
}

export type CvDocument = ReturnType<typeof useCvDocument>;
