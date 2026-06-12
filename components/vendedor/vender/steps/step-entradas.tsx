"use client";

import { formatValor } from "@/components/vendedor/format";
import type { EntradaTipo } from "@/lib/domain/vendas/schemas";
import type { EntradaDraft, TrocaDraft, VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { EntradaTrocaForm } from "@/components/vendedor/vender/steps/entrada-troca-form";

const TIPO_OPTIONS: { value: EntradaTipo; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "carro_troca", label: "Carro na troca" }
];

/**
 * Passo 3: entradas (sinal). Pergunta se tem entrada; cada entrada tem um
 * tipo e os campos condicionais (parcelas do cartão, sub-form do carro de
 * troca). Suporta múltiplas entradas (ex.: PIX + carro na troca).
 */
export function StepEntradas({
  draft,
  totalEntradas,
  onTemEntrada,
  addEntrada,
  removeEntrada,
  patchEntrada,
  patchEntradaTroca
}: {
  draft: VendaDraft;
  totalEntradas: number;
  onTemEntrada: (tem: boolean) => void;
  addEntrada: (tipo?: EntradaTipo) => void;
  removeEntrada: (key: string) => void;
  patchEntrada: (key: string, changes: Partial<Omit<EntradaDraft, "key" | "troca">>) => void;
  patchEntradaTroca: (key: string, changes: Partial<TrocaDraft>) => void;
}) {
  const temEntrada = draft.temEntrada && draft.entradas.length > 0;

  return (
    <div className="vender-step">
      <fieldset className="vender-forma">
        <legend>O cliente vai dar entrada?</legend>
        <div className="vender-forma-options is-inline" data-testid="vender-tem-entrada">
          <label className={`vender-forma-option ${temEntrada ? "is-active" : ""}`.trim()}>
            <input type="radio" name="tem_entrada" checked={temEntrada} onChange={() => onTemEntrada(true)} />
            <span className="vender-forma-label">Sim</span>
          </label>
          <label className={`vender-forma-option ${!temEntrada ? "is-active" : ""}`.trim()}>
            <input type="radio" name="tem_entrada" checked={!temEntrada} onChange={() => onTemEntrada(false)} />
            <span className="vender-forma-label">Não</span>
          </label>
        </div>
      </fieldset>

      {temEntrada ? (
        <>
          {draft.entradas.map((entrada, index) => (
            <div key={entrada.key} className="vender-entrada" data-testid={`vender-entrada-${index}`}>
              <header className="vender-entrada-head">
                <strong>Entrada {index + 1}</strong>
                <button
                  type="button"
                  className="vendedor-btn-ghost"
                  onClick={() => removeEntrada(entrada.key)}
                  data-testid={`vender-entrada-remover-${index}`}
                >
                  Remover
                </button>
              </header>

              <div className="vendedor-field-row">
                <label className="vendedor-field">
                  <span>Tipo da entrada</span>
                  <select
                    value={entrada.tipo}
                    onChange={(event) => patchEntrada(entrada.key, { tipo: event.target.value as EntradaTipo })}
                    data-testid={`vender-entrada-tipo-${index}`}
                  >
                    {TIPO_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="vendedor-field">
                  <span>Valor (R$) *</span>
                  <input
                    inputMode="decimal"
                    value={entrada.valor}
                    onChange={(event) => patchEntrada(entrada.key, { valor: event.target.value })}
                    placeholder="5000,00"
                    data-testid={`vender-entrada-valor-${index}`}
                  />
                </label>
              </div>

              {entrada.tipo === "cartao_credito" ? (
                <div className="vendedor-field-row">
                  <label className="vendedor-field">
                    <span>Qtd. parcelas *</span>
                    <input
                      inputMode="numeric"
                      value={entrada.cartaoParcelasQtde}
                      onChange={(event) => patchEntrada(entrada.key, { cartaoParcelasQtde: event.target.value })}
                      placeholder="10"
                    />
                  </label>
                  <label className="vendedor-field">
                    <span>Valor da parcela (R$)</span>
                    <input
                      inputMode="decimal"
                      value={entrada.cartaoParcelaValor}
                      onChange={(event) => patchEntrada(entrada.key, { cartaoParcelaValor: event.target.value })}
                      placeholder="500,00"
                    />
                  </label>
                </div>
              ) : null}

              {entrada.tipo === "carro_troca" ? (
                entrada.carroTrocaId ? (
                  <p className="vendedor-hint" data-testid={`vender-entrada-troca-existente-${index}`}>
                    Carro da troca já cadastrado na loja{entrada.descricao ? ` — ${entrada.descricao}` : ""}. Para
                    alterar os dados do veículo, use o grid de CARROS.
                  </p>
                ) : (
                  <EntradaTrocaForm troca={entrada.troca} onChange={(changes) => patchEntradaTroca(entrada.key, changes)} />
                )
              ) : null}
            </div>
          ))}

          <div className="vender-entrada-actions">
            <button type="button" className="vendedor-btn-ghost" onClick={() => addEntrada()} data-testid="vender-entrada-add">
              + Adicionar outra entrada
            </button>
            <p className="vendedor-hint" data-testid="vender-entrada-total">
              Total de entradas: {formatValor(totalEntradas) ?? "R$ 0,00"}
            </p>
          </div>
        </>
      ) : (
        <p className="vendedor-hint">Sem entrada — o valor integral segue na forma de pagamento escolhida.</p>
      )}
    </div>
  );
}
