import { lazy, Suspense, useState } from "react";
import "./App.css";
import { useCvDocument } from "./hooks/useCvDocument";
import { CvWorkspace } from "./components/CvWorkspace";
import { languageOptions } from "./lib/templates";
import type { CvLanguage } from "./lib/cv-renderer";

// Lazy — keeps AI SDKs, pdfjs, and mammoth out of the Manual tab's initial
// bundle; loaded only when the "Com IA" tab is first opened.
const AiPanel = lazy(() =>
  import("./components/ai/AiPanel").then((m) => ({ default: m.AiPanel })),
);

type Tab = "manual" | "ai";

type GuideStep = {
  title: string;
  description: string;
};

const tabGuides: Record<Tab, { title: string; intro: string; steps: GuideStep[]; tip: string }> = {
  manual: {
    title: "Como usar o modo Manual",
    intro: "Use esta aba quando você já tem os dados do seu currículo em JSON ou quer preenchê-los por conta própria.",
    steps: [
      {
        title: "Comece com um modelo ou cole seu conteúdo",
        description: "Use “Carregar mínimo” ou “Carregar completo” para ver um exemplo. Depois, substitua os dados pelo seu currículo.",
      },
      {
        title: "Organize e confira o JSON",
        description: "Clique em “Formatar JSON” para deixar o texto organizado e em “Validar JSON” para encontrar campos faltando ou erros.",
      },
      {
        title: "Revise antes de baixar",
        description: "Clique em “Ver Preview” para conferir como o currículo ficará. Ajuste o conteúdo no editor sempre que precisar.",
      },
      {
        title: "Baixe a versão final",
        description: "Escolha “Gerar PDF” ou “Gerar DOCX”. Defina o idioma no topo da página antes de criar o arquivo.",
      },
    ],
    tip: "O botão “Copiar prompt” ajuda a pedir a uma IA externa que crie um JSON no formato correto.",
  },
  ai: {
    title: "Como usar o modo Com IA",
    intro: "Use esta aba para criar um currículo a partir da sua experiência e da descrição de uma vaga.",
    steps: [
      {
        title: "Escolha como usar a IA",
        description: "Em “Configuração”, escolha Claude Code, Gemini, OpenRouter ou API Anthropic. Gemini e OpenRouter usam chaves configuradas no servidor local; Anthropic pede a chave na interface.",
      },
      {
        title: "Conte sua trajetória",
        description: "Adicione arquivos do seu currículo ou escreva um resumo em “sobre mim”. Em seguida, clique em “Processar documentos → perfil”.",
      },
      {
        title: "Confira seu perfil",
        description: "Leia o profile.json criado pela IA. Você pode corrigir qualquer informação e clicar em “Salvar profile.json”.",
      },
      {
        title: "Informe a vaga e gere o currículo",
        description: "Cole a descrição da vaga e clique em “Gerar CV”. Depois, revise o JSON gerado, abra o preview e baixe em PDF ou DOCX.",
      },
    ],
    tip: "Depois de gerar, use “Refinar” para pedir ajustes simples, como encurtar o texto ou dar mais destaque a uma habilidade.",
  },
};

function UsageGuide({ tab }: { tab: Tab }) {
  const guide = tabGuides[tab];

  return (
    <details className="usage-guide" key={tab} open>
      <summary className="usage-guide-summary">
        <span>
          <span className="usage-guide-eyebrow">Guia rápido</span>
          <span className="usage-guide-title">{guide.title}</span>
        </span>
        <span className="usage-guide-toggle" aria-hidden="true">
          <span className="usage-guide-toggle-show">Ver guia</span>
          <span className="usage-guide-toggle-hide">Ocultar guia</span>
        </span>
      </summary>
      <div className="usage-guide-content">
        <p className="usage-guide-intro">{guide.intro}</p>
        <ol className="usage-guide-steps">
          {guide.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </li>
          ))}
        </ol>
        <p className="usage-guide-tip"><strong>Dica:</strong> {guide.tip}</p>
      </div>
    </details>
  );
}

function App() {
  const doc = useCvDocument();
  const [tab, setTab] = useState<Tab>("manual");

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">CV</div>
          <div>
            <p className="brand-title">CV Gen</p>
            <p className="brand-sub">JSON → DOCX · PDF · Preview</p>
          </div>
        </div>
        <div className="header-controls">
          <div className="field">
            <label htmlFor="language">Idioma</label>
            <select
              id="language"
              value={doc.language}
              onChange={(event) => doc.changeLanguage(event.target.value as CvLanguage)}
            >
              {languageOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "manual"}
          className={`tab ${tab === "manual" ? "active" : ""}`}
          onClick={() => setTab("manual")}
        >
          Manual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ai"}
          className={`tab ${tab === "ai" ? "active" : ""}`}
          onClick={() => setTab("ai")}
        >
          Com IA
        </button>
      </nav>

      <UsageGuide tab={tab} />

      {tab === "manual" ? (
        <CvWorkspace doc={doc} />
      ) : (
        <Suspense fallback={<p className="ai-hint">Carregando módulo de IA…</p>}>
          <AiPanel doc={doc} />
        </Suspense>
      )}

      {/* ── Status Bar ── */}
      {doc.status && (
        <div className={`status-bar ${doc.status.type}`} role="status">
          {doc.status.type === "loading" && (
            <span className="status-spinner" aria-hidden="true" />
          )}
          {doc.status.message}
        </div>
      )}
    </div>
  );
}

export default App;
