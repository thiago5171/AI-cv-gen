import { formatUsd, type CostBreakdown } from "../../lib/ai/cost";
import type { TokenUsage } from "../../lib/ai/types";

type Props = {
  last: CostBreakdown | null;
  session: TokenUsage;
  cacheWarning: boolean;
};

/** Per-call and cumulative token/cost display. */
export function TokenPanel({ last, session, cacheWarning }: Props) {
  return (
    <section className="card ai-section">
      <h3>Tokens & custo</h3>
      {cacheWarning && (
        <p className="ai-warn">
          ⚠ Leitura de cache = 0 nesta chamada. Algo pode estar invalidando o
          cache (perfil alterado, modelo trocado).
        </p>
      )}
      <div className="token-grid">
        <div>
          <p className="token-head">Última chamada</p>
          {last ? (
            <ul className="token-list">
              <li><span>Input</span><b>{last.inputTokens.toLocaleString()}</b></li>
              <li><span>Cache escrito</span><b>{last.cacheWriteTokens.toLocaleString()}</b></li>
              <li><span>Cache lido</span><b>{last.cacheReadTokens.toLocaleString()}</b></li>
              <li><span>Output</span><b>{last.outputTokens.toLocaleString()}</b></li>
              <li className="token-total">
                <span>Custo</span>
                <b>{last.free ? "Grátis (free tier)" : formatUsd(last.usd)}</b>
              </li>
            </ul>
          ) : (
            <p className="ai-hint">Nenhuma chamada ainda.</p>
          )}
        </div>
        <div>
          <p className="token-head">Sessão (acumulado)</p>
          <ul className="token-list">
            <li><span>Input</span><b>{session.inputTokens.toLocaleString()}</b></li>
            <li><span>Cache lido</span><b>{session.cacheReadTokens.toLocaleString()}</b></li>
            <li><span>Output</span><b>{session.outputTokens.toLocaleString()}</b></li>
            <li className="token-total"><span>Custo total</span><b>{formatUsd(session.usd)}</b></li>
          </ul>
        </div>
      </div>
      <p className="ai-hint">
        Custo estimado pela tabela de preços da API — confirme na sua conta Anthropic. Chamadas
        pelo Gemini no free tier não geram cobrança e entram como zero.
      </p>
    </section>
  );
}
