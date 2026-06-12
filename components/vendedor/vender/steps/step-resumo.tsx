"use client";

import { useMemo, useState } from "react";
import { carroDisplayName, formatValor, parseDecimal, parseInteiro } from "@/components/vendedor/format";
import { buildMensagemVenda, computePagamentoInsight, type VendaResumo } from "@/lib/domain/vendas/calculo";
import type { VendaDraft } from "@/components/vendedor/vender/use-venda-draft";

function readStr(carro: Record<string, unknown> | null, key: string): string | null {
  const value = carro?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNum(carro: Record<string, unknown> | null, key: string): number | null {
  const value = carro?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsed(value: string): number | null {
  const result = parseDecimal(value);
  return result != null && !Number.isNaN(result) ? result : null;
}

/**
 * Passo 5: o Vendas 2.0 calcula tudo e mostra a mensagem final da venda.
 * O botão "Fechar a ficha" fica no rodapé do wizard (workspace).
 */
export function StepResumo({ draft, resumo, financValorEfetivo }: { draft: VendaDraft; resumo: VendaResumo; financValorEfetivo: number | null }) {
  const [copied, setCopied] = useState(false);
  const carro = draft.carro;

  const mensagem = useMemo(() => {
    if (!carro) return "";
    return buildMensagemVenda({
      carro: {
        modelo: carroDisplayName(carro),
        placa: readStr(carro, "placa"),
        cor: readStr(carro, "cor"),
        anoFab: readNum(carro, "ano_fab"),
        anoMod: readNum(carro, "ano_mod"),
        hodometro: readNum(carro, "hodometro"),
        anoIpvaPago: readNum(carro, "ano_ipva_pago")
      },
      venda: {
        valorTotal: parsed(draft.valorTotal),
        desconto: parsed(draft.desconto),
        formaPagamento: draft.formaPagamento,
        financValor: financValorEfetivo,
        financBanco: draft.financBanco.trim() || null,
        financParcelasQtde: Number(draft.financParcelasQtde) || null,
        financParcelaValor: parsed(draft.financParcelaValor),
        cartaoParcelasQtde: Number(draft.cartaoParcelasQtde) || null,
        cartaoParcelaValor: parsed(draft.cartaoParcelaValor),
        tipoTransferencia: draft.tipoTransferencia
      },
      entradas: draft.entradas.map((entrada) => ({ tipo: entrada.tipo, valor: parsed(entrada.valor) }))
    });
  }, [carro, draft, financValorEfetivo]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie a mensagem da venda:", mensagem);
    }
  }

  const usaFinanc = draft.formaPagamento === "financiamento" || draft.formaPagamento === "consorcio";
  const parcelasQtde = (() => {
    const value = parseInteiro(usaFinanc ? draft.financParcelasQtde : draft.cartaoParcelasQtde);
    return value != null && !Number.isNaN(value) ? value : null;
  })();
  const insight = computePagamentoInsight({
    formaPagamento: draft.formaPagamento,
    parcelasQtde,
    parcelaValor: parsed(usaFinanc ? draft.financParcelaValor : draft.cartaoParcelaValor),
    valorFinanciado: financValorEfetivo,
    totalEntradas: resumo.totalEntradas,
    valorTotal: parsed(draft.valorTotal),
    desconto: parsed(draft.desconto)
  });

  const linhas: Array<{ label: string; value: string | null }> = [
    { label: "Valor da venda", value: formatValor(parsed(draft.valorTotal)) },
    { label: "Desconto", value: formatValor(parsed(draft.desconto)) },
    { label: "Total de entradas", value: resumo.totalEntradas > 0 ? formatValor(resumo.totalEntradas) : null },
    {
      label: draft.formaPagamento === "financiamento" ? "Valor financiado" : "Restante a pagar",
      value: formatValor(draft.formaPagamento === "financiamento" ? financValorEfetivo : resumo.valorFinanciado)
    },
    {
      label: "Total das parcelas",
      value: insight.totalParcelas != null ? `${parcelasQtde}x = ${formatValor(insight.totalParcelas)}` : null
    },
    {
      label: "Juros/encargos embutidos",
      value:
        insight.jurosEmbutidos != null
          ? `${insight.jurosEmbutidos >= 0 ? "+" : "−"} ${formatValor(Math.abs(insight.jurosEmbutidos))}`
          : null
    },
    {
      label: "Total pago pelo cliente",
      value: insight.custoTotalCliente != null ? formatValor(insight.custoTotalCliente) : null
    },
    { label: "Transferência", value: formatValor(parsed(draft.valorTransferencia)) }
  ];

  return (
    <div className="vender-step">
      {resumo.entradasExcedemTotal ? (
        <p className="vendedor-error" data-testid="vender-resumo-inconsistente">
          Atenção: as entradas + desconto excedem o valor da venda. Revise os valores antes de fechar.
        </p>
      ) : null}

      <dl className="vendedor-info-grid" data-testid="vender-resumo-valores">
        {linhas
          .filter((linha) => linha.value != null)
          .map((linha) => (
            <div key={linha.label} className="vendedor-info-item">
              <dt>{linha.label}</dt>
              <dd>{linha.value}</dd>
            </div>
          ))}
      </dl>

      <div className="vender-mensagem" data-testid="vender-mensagem">
        <header className="vender-mensagem-head">
          <strong>Mensagem da venda</strong>
          <button type="button" className="vendedor-btn-ghost" onClick={() => void copiar()} data-testid="vender-mensagem-copiar">
            {copied ? "Copiada!" : "Copiar"}
          </button>
        </header>
        <p>{mensagem}</p>
      </div>

      <p className="vendedor-hint">
        Ao fechar a ficha, o veículo vira VENDIDO, o envelope de documentos entra em FECHANDO e o processo aparece no
        Word para gerar os documentos.
      </p>
    </div>
  );
}
