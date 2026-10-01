import { useRef, useState } from "react";
import type { CvDocument } from "../../hooks/useCvDocument";
import { useAiTab } from "../../hooks/useAiTab";
import { GEMINI_MODELS, MODELS, OPENROUTER_MODELS } from "../../lib/ai/cost";
import { CvWorkspace } from "../CvWorkspace";
import { TokenPanel } from "./TokenPanel";
import type {
  AnthropicModelId,
  Effort,
  GeminiModelId,
  OpenRouterModelId,
} from "../../lib/ai/types";

const EFFORTS: Effort[] = ["low", "medium", "high"];

/** The full "Com IA" tab: config → docs → profile → job → CV workspace → tokens → history. */
export function AiPanel({ doc }: { doc: CvDocument }) {
  const ai = useAiTab(doc.loadCv);
  const [aboutText, setAboutText] = useState("");
  const [refineText, setRefineText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <div className="ai-panel">
      {/* (a) Provider + API key + modelo */}
      <section className="card ai-section">
        <h3>1 · Configuração</h3>

        <label className="field-label">Como gerar</label>
        <div className="provider-toggle">
          <button
            type="button"
            className={`provider-btn ${ai.provider === "claude-local" ? "active" : ""}`}
            onClick={() => ai.updateProvider("claude-local")}
          >
            Claude Code (local)
            <small>usa sua assinatura · sem créditos</small>
          </button>
          <button
            type="button"
            className={`provider-btn ${ai.provider === "gemini-local" ? "active" : ""}`}
            onClick={() => ai.updateProvider("gemini-local")}
          >
            Gemini (local)
            <small>free tier · sem cobrança</small>
          </button>
          <button
            type="button"
            className={`provider-btn ${ai.provider === "openrouter-local" ? "active" : ""}`}
            onClick={() => ai.updateProvider("openrouter-local")}
          >
            OpenRouter (local)
            <small>modelos grátis · automático</small>
          </button>
          <button
            type="button"
            className={`provider-btn ${ai.provider === "anthropic-api" ? "active" : ""}`}
            onClick={() => ai.updateProvider("anthropic-api")}
          >
            API key
            <small>console Anthropic · créditos</small>
          </button>
        </div>

        {ai.provider === "claude-local" && (
          <p className="ai-warn">
            ℹ Usa o <code>claude</code> CLI (Claude Code) da sua máquina, via
            <code> npm run dev</code>. Consome sua cota do Claude Code, não créditos de API.
            Precisa estar logado no CLI. Não funciona em site publicado (estático).
          </p>
        )}
        {ai.provider === "gemini-local" && (
          <p className="ai-warn">
            ℹ Usa a API do Gemini no <b>free tier</b> (sem cobrança). Requer
            <code> GEMINI_API_KEY</code> no arquivo <code>.env.local</code> e só funciona com
            <code> npm run dev</code> — a chave fica no servidor, nunca no navegador. Há limite
            diário por modelo, e no free tier o conteúdo enviado pode ser usado pelo Google para
            melhorar os produtos deles: evite documentos sensíveis.
          </p>
        )}
        {ai.provider === "openrouter-local" && (
          <p className="ai-warn">
            ℹ Usa o OpenRouter Free Router. Requer <code> OPENROUTER_API_KEY</code> no
            <code> .env.local</code> e só funciona com <code> npm run dev</code> — a chave
            fica no servidor, nunca no navegador. O OpenRouter escolhe automaticamente um
            modelo gratuito compatível; limites e disponibilidade podem bloquear a chamada.
          </p>
        )}
        {ai.provider === "anthropic-api" && (
          <p className="ai-warn">
            ⚠ App 100% no navegador. Sua API key fica salva apenas neste browser
            (localStorage) e é enviada direto para a Anthropic. Uso pessoal.
          </p>
        )}

        {ai.provider === "anthropic-api" && (
          <>
            <label className="field-label" htmlFor="ai-key">API key da Anthropic</label>
            <input
              id="ai-key"
              className="ai-input"
              type="password"
              placeholder="sk-ant-..."
              value={ai.apiKey}
              onChange={(e) => ai.updateApiKey(e.target.value)}
              spellCheck={false}
            />
          </>
        )}
        <div className="ai-row">
          <div>
            <label className="field-label" htmlFor="ai-model">Modelo</label>
            {ai.provider === "gemini-local" ? (
              <select
                id="ai-model"
                className="ai-input"
                value={ai.settings.geminiModel}
                onChange={(e) =>
                  ai.updateSettings({
                    ...ai.settings,
                    geminiModel: e.target.value as GeminiModelId,
                  })
                }
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            ) : ai.provider === "openrouter-local" ? (
              <select
                id="ai-model"
                className="ai-input"
                value={ai.settings.openrouterModel}
                onChange={(e) =>
                  ai.updateSettings({
                    ...ai.settings,
                    openrouterModel: e.target.value as OpenRouterModelId,
                  })
                }
              >
                {OPENROUTER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            ) : (
              <select
                id="ai-model"
                className="ai-input"
                value={ai.settings.model}
                onChange={(e) =>
                  ai.updateSettings({ ...ai.settings, model: e.target.value as AnthropicModelId })
                }
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            )}
          </div>
          {ai.provider !== "gemini-local" && ai.provider !== "openrouter-local" && (
            <div>
              <label className="field-label" htmlFor="ai-effort">Esforço (avançado)</label>
              <select
                id="ai-effort"
                className="ai-input"
                value={ai.settings.effort}
                onChange={(e) =>
                  ai.updateSettings({ ...ai.settings, effort: e.target.value as Effort })
                }
              >
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="ai-row ai-backup">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => ai.exportConfig(false)}>
            Exportar config
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => importRef.current?.click()}>
            Importar config
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && ai.importConfig(e.target.files[0])}
          />
        </div>
      </section>

      {/* (b) Documentos de background */}
      <section className="card ai-section">
        <h3>2 · Documentos de background</h3>
        <p>
          PDF, DOCX, MD ou TXT. O texto é extraído no navegador e guardado de
          forma compacta (~{ai.totalDocTokens.toLocaleString()} tokens no total).
        </p>
        <div className="ai-row ai-backup">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()} disabled={ai.busy}>
            + Adicionar arquivos
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.md,.txt"
            multiple
            hidden
            onChange={(e) => e.target.files && ai.addFiles(e.target.files)}
          />
        </div>
        {ai.docs.length > 0 && (
          <ul className="ai-doc-list">
            {ai.docs.map((d) => (
              <li key={d.id}>
                <span className="ai-doc-name">{d.name}</span>
                <span className="ai-doc-meta">
                  {d.kind} · ~{d.approxTokens.toLocaleString()} tk
                  {d.fallbackPdfBase64 ? " · escaneado" : ""}
                </span>
                <button type="button" className="ai-doc-del" onClick={() => ai.removeDoc(d.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <label className="field-label" htmlFor="ai-about">Ou escreva um texto "sobre mim"</label>
        <textarea
          id="ai-about"
          className="ai-textarea"
          value={aboutText}
          onChange={(e) => setAboutText(e.target.value)}
          placeholder="Resumo livre da sua carreira, objetivos, contexto..."
        />
        <div className="ai-row ai-backup">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { ai.addAboutText(aboutText); setAboutText(""); }}
          >
            Adicionar texto
          </button>
          <button type="button" className="btn btn-primary" onClick={ai.processDocs} disabled={ai.busy}>
            {ai.busy ? "Processando..." : "Processar documentos → perfil"}
          </button>
        </div>
      </section>

      {/* (c) Editor do profile.json */}
      <section className="card ai-section">
        <h3>3 · profile.json (perfil canônico)</h3>
        <p>
          Reutilizado a cada geração (fica em cache, barato). Re-extraia só quando
          mudar seus documentos. Edite à vontade.
        </p>
        <textarea
          className="ai-textarea ai-mono"
          value={ai.profileText}
          onChange={(e) => ai.setProfileText(e.target.value)}
          spellCheck={false}
          placeholder="Processe documentos para gerar, ou cole um profile.json aqui."
        />
        <div className="ai-row ai-backup">
          <button type="button" className="btn btn-outline btn-sm" onClick={ai.saveEditedProfile}>
            Salvar profile.json
          </button>
        </div>
      </section>

      {/* (d) Descrição da vaga + Gerar */}
      <section className="card ai-section">
        <h3>4 · Descrição da vaga</h3>
        <textarea
          className="ai-textarea"
          value={ai.jobDescription}
          onChange={(e) => ai.setJobDescription(e.target.value)}
          placeholder="Cole aqui a descrição da vaga..."
        />
        <div className="ai-row ai-backup">
          <button
            type="button"
            className="btn btn-primary"
            onClick={ai.runGenerate}
            disabled={ai.busy || !ai.hasProfile}
          >
            {ai.busy ? "Gerando..." : "Gerar CV"}
          </button>
          {!ai.hasProfile && <span className="ai-hint">Gere/salve o profile.json primeiro.</span>}
        </div>
        {ai.status && (
          <div className={`status-card ${ai.status.type === "error" ? "error" : "ok"}`}>
            <p className="status-title">{ai.status.message}</p>
          </div>
        )}
      </section>

      {/* (e) CV gerado → mesmo preview/editor/export da aba Manual */}
      <CvWorkspace
        doc={doc}
        hideSamples
        editorTitle="CV gerado"
        editorSubtitle="Resultado da IA — edite, veja o preview e exporte igual à aba Manual."
      />

      {/* refino */}
      <section className="card ai-section">
        <h3>Refinar (multi-turn)</h3>
        <div className="ai-row ai-refine">
          <input
            className="ai-input"
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            placeholder='Ex: "mais curto", "foca em liderança"'
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { ai.runRefine(refineText); setRefineText(""); }}
            disabled={ai.busy}
          >
            Refinar
          </button>
        </div>
      </section>

      {/* (f) painel de tokens/custo */}
      <TokenPanel last={ai.lastCost} session={ai.sessionUsage} cacheWarning={ai.cacheWarning} />

      {/* (g) histórico */}
      <section className="card ai-section">
        <h3>Histórico de gerações</h3>
        {ai.history.length === 0 ? (
          <p className="ai-hint">Nenhuma geração ainda.</p>
        ) : (
          <ul className="ai-history">
            {ai.history.map((h) => (
              <li key={h.id}>
                <span className="ai-hist-desc">
                  {h.jobDescription.slice(0, 80) || "(sem descrição)"}
                </span>
                <span className="ai-hist-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ai.reopenHistory(h)}>Reabrir</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => ai.duplicateHistory(h)}>Duplicar</button>
                  <button type="button" className="ai-doc-del" onClick={() => ai.removeHistory(h.id)}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
