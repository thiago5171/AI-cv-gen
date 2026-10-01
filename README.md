# CV Gen

Gerador de currículos orientado por JSON, com preview, exportação DOCX/PDF e integrações de IA.

JSON-first resume generator with preview, DOCX/PDF export, and AI integrations.

- [Português (PT-BR)](#português-pt-br)
- [English](#english)

---

## Português (PT-BR)

### Visão geral

O CV Gen transforma dados de currículo em JSON em um currículo pronto para revisão, exportação em DOCX, PDF e HTML. A aba **Com IA** consolida documentos em um `profile.json` e gera versões adaptadas a uma vaga, reutilizando o mesmo editor, preview e exportação do modo manual.

### Recursos

- Edição, formatação e validação de currículo em JSON.
- Preview HTML no navegador.
- Exportação para DOCX, PDF e HTML.
- Saída em português ou inglês.
- Integração com IA para destilar documentos, gerar currículos e refiná-los.
- Histórico local de gerações, documentos e `profile.json`.
- Modo red-team para testar seu próprio pipeline de triagem contra conteúdo oculto em DOCX/PDF.

### Início rápido

Pré-requisito: Node.js e npm instalados.

```bash
npm install
npm run dev
```

Abra a URL exibida pelo Vite no terminal. Para verificar o projeto:

```bash
npm run lint
npm run build
```

### Uso manual

1. Abra a aba **Manual**.
2. Carregue um exemplo ou cole seu JSON.
3. Clique em **Formatar JSON** e **Validar JSON**.
4. Escolha `PT-BR` ou `EN-US` no seletor superior.
5. Revise em **Ver Preview** e exporte DOCX ou PDF.

O contrato completo do JSON está em [src/data/cv.schema.json](src/data/cv.schema.json). Exemplos prontos estão em [cv-examples](cv-examples).

### Nome dos arquivos exportados

Defina uma base de nome opcional em `.env.local`:

```env
VITE_CV_FILENAME=curriculo
```

O idioma usado no nome é sempre o que estiver selecionado **na hora de gerar o arquivo**:

| Idioma selecionado | Exemplo de PDF | Exemplo de DOCX |
| --- | --- | --- |
| `PT-BR` | `curriculo-pt.pdf` | `curriculo-pt.docx` |
| `EN-US` | `curriculo-en.pdf` | `curriculo-en.docx` |

Você também pode controlar a posição do sufixo com `{lang}`:

```env
VITE_CV_FILENAME=cv-{lang}-final
```

Isso gera `cv-pt-final.pdf` ou `cv-en-final.docx`. Sem essa variável, o padrão é `cv-pt.*` ou `cv-en.*`. Extensões informadas na variável são removidas, pois o app aplica a extensão correta automaticamente.

`VITE_CV_LANGUAGE` não é necessário: o seletor da interface é a fonte final do idioma de saída.

### Integrações de IA

A aba **Com IA** oferece quatro caminhos. Todos produzem o mesmo JSON validado e usam o mesmo preview/exportador.

| Provedor | Configuração | Como funciona |
| --- | --- | --- |
| Claude Code local | CLI `claude` autenticado | Chama o CLI local por `/api/claude` durante `npm run dev`. Usa a cota da assinatura Claude Code. |
| Anthropic API | Chave preenchida na interface | A chave fica no `localStorage` do navegador e é enviada diretamente à Anthropic. Uso pessoal. |
| Gemini local | `GEMINI_API_KEY` em `.env.local` | Chama `/api/gemini` no processo Vite. A chave não chega ao navegador. |
| OpenRouter local | `OPENROUTER_API_KEY` em `.env.local` | Chama `/api/openrouter` e aceita somente `openrouter/free`, que seleciona automaticamente um modelo gratuito compatível. |

Para usar Gemini e/ou OpenRouter localmente, crie `.env.local` na raiz do projeto:

```env
# Chaves de servidor local: nunca use o prefixo VITE_ para elas.
GEMINI_API_KEY=sua_chave_gemini
OPENROUTER_API_KEY=sua_chave_openrouter

# Configuração pública e sem segredo.
VITE_CV_FILENAME=curriculo-{lang}
```

Reinicie `npm run dev` depois de mudar `.env.local`.

#### Limitações dos provedores

- Os endpoints locais existem somente durante `npm run dev`; um build estático publicado não inclui `/api/claude`, `/api/gemini` nem `/api/openrouter`.
- Gemini e OpenRouter têm limites de disponibilidade e requisições. O OpenRouter Free Router pode mudar de modelo entre chamadas e pode ficar sem capacidade temporariamente.
- PDF escaneado sem camada de texto é aceito no fluxo Anthropic, mas os modos locais Gemini e OpenRouter usam apenas texto extraído.
- Apenas Anthropic API usa o cache de prompt entre refinamentos. Os demais provedores reenviam o currículo atual.
- O Gemini free tier e os provedores escolhidos pelo OpenRouter têm políticas próprias de dados. Revise as configurações de privacidade antes de enviar dados pessoais.

### Fluxo com IA

1. Escolha o provedor em **Configuração**.
2. Adicione PDF, DOCX, MD, TXT ou um texto sobre sua trajetória.
3. Clique em **Processar documentos → perfil** para criar o `profile.json`.
4. Revise ou edite o perfil canônico.
5. Cole a descrição da vaga e clique em **Gerar CV**.
6. Use **Refinar** para pedir ajustes e exporte o resultado.

Currículos criados pela IA não incluem o `summary` geral do topo. As datas preservam o formato encontrado no perfil ou no currículo atual, e os modelos são instruídos a consultar todo o contexto antes de deixar um campo obrigatório vazio.

O histórico salva cada geração no navegador. Ele não é enviado inteiro a um provedor; refinamentos usam o currículo atual e o perfil atual.

### Dados, privacidade e segurança

- Documentos extraídos e histórico ficam localmente no navegador, via IndexedDB; o `profile.json` e preferências leves usam `localStorage`.
- `GEMINI_API_KEY` e `OPENROUTER_API_KEY` ficam somente no processo Vite. Nunca exponha essas chaves com prefixo `VITE_`, no Git ou no navegador.
- A chave Anthropic é um modo de uso pessoal no browser. Não use uma chave compartilhada ou de produção nessa opção.
- `.env.local` é ignorado pelo Git por `*.local`; ainda assim, não compartilhe seu conteúdo em chats, issues ou capturas de tela.
- Se uma chave for exposta, revogue-a no provedor e gere outra imediatamente.

### Arquitetura

```text
JSON -> AJV (cv.schema.json) -> CvData
  |- Preview: renderCvHtml() -> iframe
  |- DOCX: template -> PizZip + docxtemplater -> download
  |- PDF: renderCvHtml() -> html2pdf.js -> download
  `- IA: documentos -> profile.json -> CV JSON -> preview/exportação compartilhados
```

Principais módulos:

- [src/lib/cv-renderer.ts](src/lib/cv-renderer.ts): tipo `CvData`, rótulos e HTML do currículo.
- [src/lib/documents.ts](src/lib/documents.ts): exportação DOCX/PDF e downloads.
- [src/lib/validation.ts](src/lib/validation.ts): validação AJV.
- [src/hooks/useCvDocument.ts](src/hooks/useCvDocument.ts): estado do documento, idioma e exportação.
- [src/hooks/useAiTab.ts](src/hooks/useAiTab.ts): estado e ações da aba de IA.
- [src/lib/ai](src/lib/ai): provedores, prompts, schemas e persistência.

### Scripts úteis

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia Vite e os endpoints locais de IA. |
| `npm run build` | Executa o type-check e gera o build de produção. |
| `npm run lint` | Executa ESLint. |
| `node scripts/generate-templates.mjs` | Regenera os templates DOCX em `public/templates/`. |
| `node scripts/verify-template.mjs` | Verifica se placeholders DOCX foram fragmentados. |
| `node scripts/generate-injection-tests.mjs` | Gera fixtures red-team para testar seu próprio triador. |

### Red-team

O projeto inclui geradores de DOCX/PDF com payloads ocultos para testar a resistência do **seu próprio** pipeline de triagem de currículos. Use apenas em ambientes sob seu controle. Não envie esses arquivos a empregadores ou sistemas de terceiros.

### Produção

O build é estático. Para publicar qualquer integração de IA, mova as chamadas para um backend real, mantenha chaves em um gerenciador de segredos, aplique autenticação, rate limiting e limites de custo.

---

## English

### Overview

CV Gen turns resume data written in JSON into a reviewable resume with DOCX, PDF, and HTML export. The **AI** tab consolidates source documents into a `profile.json`, then creates job-specific resume versions while reusing the same editor, preview, and export pipeline as manual mode.

### Features

- JSON resume editing, formatting, and validation.
- In-browser HTML preview.
- DOCX, PDF, and HTML export.
- Portuguese and English output.
- AI integrations for document distillation, resume generation, and refinement.
- Local generation history, documents, and `profile.json` persistence.
- Red-team fixtures for testing your own resume-screening pipeline against hidden content.

### Quick start

Prerequisite: Node.js and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Validate the project with:

```bash
npm run lint
npm run build
```

### Manual workflow

1. Open the **Manual** tab.
2. Load a sample or paste your JSON.
3. Use **Format JSON** and **Validate JSON**.
4. Select `PT-BR` or `EN-US` in the header.
5. Preview and export DOCX or PDF.

The full contract is in [src/data/cv.schema.json](src/data/cv.schema.json); example documents live in [cv-examples](cv-examples).

### Export file names

Set an optional filename base in `.env.local`:

```env
VITE_CV_FILENAME=resume
```

The language suffix always comes from the language currently selected when the file is generated:

| Selected language | PDF example | DOCX example |
| --- | --- | --- |
| `PT-BR` | `resume-pt.pdf` | `resume-pt.docx` |
| `EN-US` | `resume-en.pdf` | `resume-en.docx` |

Use `{lang}` to control where the suffix appears:

```env
VITE_CV_FILENAME=resume-{lang}-final
```

This produces `resume-pt-final.pdf` or `resume-en-final.docx`. If unset, the default is `cv-pt.*` or `cv-en.*`. File extensions in the variable are removed because the app supplies the correct extension.

You do not need `VITE_CV_LANGUAGE`: the UI selector is the final source of truth for generated output language.

### AI integrations

The **AI** tab provides four paths. Each returns the same validated JSON shape and uses the shared preview/export flow.

| Provider | Setup | Behavior |
| --- | --- | --- |
| Local Claude Code | Authenticated `claude` CLI | Calls the local CLI through `/api/claude` while `npm run dev` is running. Uses Claude Code subscription quota. |
| Anthropic API | Key entered in the UI | The key stays in browser `localStorage` and is sent directly to Anthropic. Personal-use mode. |
| Local Gemini | `GEMINI_API_KEY` in `.env.local` | Calls `/api/gemini` in the Vite process. The key never reaches the browser. |
| Local OpenRouter | `OPENROUTER_API_KEY` in `.env.local` | Calls `/api/openrouter` and accepts only `openrouter/free`, which automatically selects a compatible free model. |

To enable local Gemini and/or OpenRouter:

```env
# Local server-only keys. Never prefix these with VITE_.
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key

# Public, non-secret configuration.
VITE_CV_FILENAME=resume-{lang}
```

Restart `npm run dev` after changing `.env.local`.

#### Provider limitations

- Local AI endpoints exist only under `npm run dev`; a published static build does not contain `/api/claude`, `/api/gemini`, or `/api/openrouter`.
- Gemini and OpenRouter have availability and request limits. OpenRouter Free Router may select a different free model on each call and can temporarily run out of capacity.
- Scanned PDFs without a text layer work in the Anthropic flow, but local Gemini and OpenRouter use extracted text only.
- Only the Anthropic API path uses prompt caching across refinements. Other providers resend the current resume.
- Gemini free-tier processing and OpenRouter upstream providers have their own data policies. Review privacy settings before sending personal data.

### AI workflow

1. Choose a provider in **Configuration**.
2. Add PDF, DOCX, MD, TXT, or free-form career text.
3. Select **Process documents -> profile** to create `profile.json`.
4. Review or edit the canonical profile.
5. Paste a job description and select **Generate CV**.
6. Use **Refine** for follow-up changes, then export the result.

AI-generated resumes omit the top-level `summary`. Dates preserve the format found in the profile or current resume, and models are instructed to consult all available context before leaving a required field blank.

Generation history remains in the browser. The entire history is not sent to a provider; refinements use the current resume and current profile.

### Data, privacy, and security

- Extracted documents and generation history are stored in the browser through IndexedDB; `profile.json` and lightweight settings use `localStorage`.
- `GEMINI_API_KEY` and `OPENROUTER_API_KEY` remain in the Vite process. Never expose them with a `VITE_` prefix, in Git, or in browser code.
- Anthropic browser mode is intended for personal keys. Do not use a shared or production key there.
- `.env.local` is ignored through `*.local`, but do not paste its contents into chat, issues, or screenshots.
- Revoke and replace any exposed key immediately.

### Architecture

```text
JSON -> AJV (cv.schema.json) -> CvData
  |- Preview: renderCvHtml() -> iframe
  |- DOCX: template -> PizZip + docxtemplater -> download
  |- PDF: renderCvHtml() -> html2pdf.js -> download
  `- AI: documents -> profile.json -> CV JSON -> shared preview/export
```

Key modules:

- [src/lib/cv-renderer.ts](src/lib/cv-renderer.ts): `CvData`, labels, and resume HTML.
- [src/lib/documents.ts](src/lib/documents.ts): DOCX/PDF export and downloads.
- [src/lib/validation.ts](src/lib/validation.ts): AJV validation.
- [src/hooks/useCvDocument.ts](src/hooks/useCvDocument.ts): document state, language, and exports.
- [src/hooks/useAiTab.ts](src/hooks/useAiTab.ts): AI tab state and actions.
- [src/lib/ai](src/lib/ai): providers, prompts, schemas, and persistence.

### Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts Vite and local AI endpoints. |
| `npm run build` | Type-checks and creates the production build. |
| `npm run lint` | Runs ESLint. |
| `node scripts/generate-templates.mjs` | Rebuilds DOCX templates in `public/templates/`. |
| `node scripts/verify-template.mjs` | Checks that DOCX placeholders are not fragmented. |
| `node scripts/generate-injection-tests.mjs` | Creates red-team fixtures for your own screener. |

### Red team

The project contains DOCX/PDF generators with hidden prompt-injection payloads for testing **your own** resume-screening pipeline. Use them only in systems you control. Do not submit these files to employers or third-party systems.

### Production deployment

The build is static. To publish any AI integration, move calls into a real backend, store keys in a secrets manager, and add authentication, rate limiting, and cost controls.
