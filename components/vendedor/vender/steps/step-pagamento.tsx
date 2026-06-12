"use client";

import { useMemo } from "react";
import { formatValor, parseDecimal, parseInteiro } from "@/components/vendedor/format";
import { computePagamentoInsight, type VendaResumo } from "@/lib/domain/vendas/calculo";
import type { FormaPagamento } from "@/lib/domain/vendas/schemas";
import type { DraftPatch, VendaDraft } from "@/components/vendedor/vender/use-venda-draft";

function parsedOrNull(value: string): number | null {
  const parsed = parseDecimal(value);
  return parsed != null && !Number.isNaN(parsed) ? parsed : null;
}

function parsedIntOrNull(value: string): number | null {
  const parsed = parseInteiro(value);
  return parsed != null && !Number.isNaN(parsed) ? parsed : null;
}

const FORMA_OPTIONS: { value: FormaPagamento; label: string; hint: string }[] = [
  { value: "financiamento", label: "Financiamento", hint: "Banco + parcelas; o valor financiado é calculado com os descontos das entradas." },
  { value: "a_vista_pix", label: "À vista no PIX", hint: "Pagamento integral no PIX." },
  { value: "cartao_credito", label: "Cartão de crédito", hint: "Parcelado no cartão." },
  { value: "consorcio", label: "Consórcio", hint: "Carta de consórcio (administradora + parcelas)." }
];

/**
 * Passo 2: valor da venda + forma de pagamento. Os campos exibidos mudam
 * conforme a forma escolhida (financiamento, cartão, consórcio).
 */
export function StepPagamento({
  draft,
  patch,
  resumo,
  financValorEfetivo
}: {
  draft: VendaDraft;
  patch: (changes: DraftPatch) => void;
  resumo: VendaResumo;
  financValorEfetivo: number | null;
}) {
  const forma = draft.formaPagamento;
  const financPlaceholder = formatValor(resumo.valorFinanciado) ?? "Calculado no resumo";

  const usaFinanc = forma === "financiamento" || forma === "consorcio";
  const insight = useMemo(
    () =>
      computePagamentoInsight({
        formaPagamento: forma,
        parcelasQtde: parsedIntOrNull(usaFinanc ? draft.financParcelasQtde : draft.cartaoParcelasQtde),
        parcelaValor: parsedOrNull(usaFinanc ? draft.financParcelaValor : draft.cartaoParcelaValor),
        valorFinanciado: financValorEfetivo,
        totalEntradas: resumo.totalEntradas,
        valorTotal: parsedOrNull(draft.valorTotal),
        desconto: parsedOrNull(draft.desconto)
      }),
    [forma, usaFinanc, draft, financValorEfetivo, resumo.totalEntradas]
  );

  const insightLinhas: Array<{ label: string; value: string }> = [];
  if (resumo.totalEntradas > 0) {
    insightLinhas.push({ label: "Entradas registradas", value: formatValor(resumo.totalEntradas) ?? "" });
  }
  if (forma === "financiamento" && financValorEfetivo != null) {
    insightLinhas.push({ label: "Valor financiado", value: formatValor(financValorEfetivo) ?? "" });
  }
  if (insight.totalParcelas != null) {
    const qtde = parsedIntOrNull(usaFinanc ? draft.financParcelasQtde : draft.cartaoParcelasQtde);
    const parcela = formatValor(parsedOrNull(usaFinanc ? draft.financParcelaValor : draft.cartaoParcelaValor));
    insightLinhas.push({
      label: "Total das parcelas",
      value: `${qtde}x de ${parcela} = ${formatValor(insight.totalParcelas)}`
    });
  }
  if (insight.jurosEmbutidos != null) {
    insightLinhas.push({
      label: "Juros/encargos embutidos",
      value: `${insight.jurosEmbutidos >= 0 ? "+" : "−"} ${formatValor(Math.abs(insight.jurosEmbutidos))}`
    });
  }
  if (insight.custoTotalCliente != null) {
    insightLinhas.push({ label: "Total pago pelo cliente", value: formatValor(insight.custoTotalCliente) ?? "" });
  }

  return (
    <div className="vender-step">
      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Valor da venda (R$) *</span>
          <input
            inputMode="decimal"
            value={draft.valorTotal}
            onChange={(event) => patch({ valorTotal: event.target.value })}
            placeholder="65000,00"
            data-testid="vender-valor-total"
          />
        </label>
        <label className="vendedor-field">
          <span>Desconto (R$)</span>
          <input
            inputMode="decimal"
            value={draft.desconto}
            onChange={(event) => patch({ desconto: event.target.value })}
            placeholder="Opcional"
            data-testid="vender-desconto"
          />
        </label>
      </div>

      <fieldset className="vender-forma" data-testid="vender-forma-pagamento">
        <legend>Forma de pagamento *</legend>
        <div className="vender-forma-options">
          {FORMA_OPTIONS.map((item) => (
            <label key={item.value} className={`vender-forma-option ${forma === item.value ? "is-active" : ""}`.trim()}>
              <input
                type="radio"
                name="forma_pagamento"
                value={item.value}
                checked={forma === item.value}
                onChange={() => patch({ formaPagamento: item.value })}
              />
              <span className="vender-forma-label">{item.label}</span>
              <span className="vender-forma-hint">{item.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {forma === "financiamento" ? (
        <div className="vender-forma-fields" data-testid="vender-campos-financiamento">
          <label className="vendedor-field">
            <span>Banco do financiamento</span>
            <input
              value={draft.financBanco}
              onChange={(event) => patch({ financBanco: event.target.value })}
              placeholder="Santander, BV, Itaú..."
            />
          </label>
          <div className="vendedor-field-row">
            <label className="vendedor-field">
              <span>Valor financiado (R$)</span>
              <input
                inputMode="decimal"
                value={draft.financValor}
                onChange={(event) => patch({ financValor: event.target.value })}
                placeholder={financPlaceholder}
              />
            </label>
            <label className="vendedor-field">
              <span>Qtd. parcelas</span>
              <input
                inputMode="numeric"
                value={draft.financParcelasQtde}
                onChange={(event) => patch({ financParcelasQtde: event.target.value })}
                placeholder="48"
              />
            </label>
            <label className="vendedor-field">
              <span>Valor da parcela (R$)</span>
              <input
                inputMode="decimal"
                value={draft.financParcelaValor}
                onChange={(event) => patch({ financParcelaValor: event.target.value })}
                placeholder="1250,00"
              />
            </label>
          </div>
          <p className="vendedor-hint">
            Deixe o valor financiado em branco para usar o calculado: venda − desconto − entradas.
          </p>
        </div>
      ) : null}

      {forma === "cartao_credito" ? (
        <div className="vender-forma-fields" data-testid="vender-campos-cartao">
          <div className="vendedor-field-row">
            <label className="vendedor-field">
              <span>Qtd. parcelas no cartão</span>
              <input
                inputMode="numeric"
                value={draft.cartaoParcelasQtde}
                onChange={(event) => patch({ cartaoParcelasQtde: event.target.value })}
                placeholder="12"
              />
            </label>
            <label className="vendedor-field">
              <span>Valor da parcela (R$)</span>
              <input
                inputMode="decimal"
                value={draft.cartaoParcelaValor}
                onChange={(event) => patch({ cartaoParcelaValor: event.target.value })}
                placeholder="4000,00"
              />
            </label>
          </div>
        </div>
      ) : null}

      {forma === "consorcio" ? (
        <div className="vender-forma-fields" data-testid="vender-campos-consorcio">
          <label className="vendedor-field">
            <span>Administradora do consórcio</span>
            <input
              value={draft.financBanco}
              onChange={(event) => patch({ financBanco: event.target.value })}
              placeholder="Administradora"
            />
          </label>
          <div className="vendedor-field-row">
            <label className="vendedor-field">
              <span>Qtd. parcelas</span>
              <input
                inputMode="numeric"
                value={draft.financParcelasQtde}
                onChange={(event) => patch({ financParcelasQtde: event.target.value })}
                placeholder="60"
              />
            </label>
            <label className="vendedor-field">
              <span>Valor da parcela (R$)</span>
              <input
                inputMode="decimal"
                value={draft.financParcelaValor}
                onChange={(event) => patch({ financParcelaValor: event.target.value })}
                placeholder="900,00"
              />
            </label>
          </div>
        </div>
      ) : null}

      {insightLinhas.length > 0 ? (
        <aside className="vender-insights" data-testid="vender-insights">
          <strong>Insights do pagamento</strong>
          <dl>
            {insightLinhas.map((linha) => (
              <div key={linha.label}>
                <dt>{linha.label}</dt>
                <dd>{linha.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      ) : null}

      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Data da venda</span>
          <input type="date" value={draft.dataVenda} onChange={(event) => patch({ dataVenda: event.target.value })} />
        </label>
        <label className="vendedor-field">
          <span>Data de entrega</span>
          <input type="date" value={draft.dataEntrega} onChange={(event) => patch({ dataEntrega: event.target.value })} />
        </label>
      </div>
    </div>
  );
}
