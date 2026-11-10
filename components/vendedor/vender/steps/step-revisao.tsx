"use client";

import { useMemo, useState } from "react";
import { copyDialog } from "@/components/ui/dialog/confirm";
import { Icon } from "@/components/vendedor/ui/icons";
import { formatValor, parseDecimal, parseInteiro } from "@/components/vendedor/format";
import { buildMensagemVenda, computePagamentoInsight, type VendaResumo } from "@/lib/domain/vendas/calculo";
import { clausulaIpva, clausulaPagamento, clausulaTransferencia, clausulaTroca, descreverDebitos, primeiraTroca } from "@/lib/domain/venda-documentos/clausulas";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import type { VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import styles from "@/components/vendedor/vender/vender.module.css";

function numero(value: string): number | null {
  const parsed = parseDecimal(value);
  return parsed != null && !Number.isNaN(parsed) ? parsed : null;
}

function inteiro(value: string): number | null {
  const parsed = parseInteiro(value);
  return parsed != null && !Number.isNaN(parsed) ? parsed : null;
}

/** Resumo de valores (lateral do fluxo): o que entra, o saldo e o custo para o cliente. */
export function ResumoValores({ draft, resumo, financValorEfetivo }: { draft: VendaDraft; resumo: VendaResumo; financValorEfetivo: number | null }) {
  const usaFinanc = draft.formaPagamento === "financiamento" || draft.formaPagamento === "consorcio";
  const qtde = inteiro(usaFinanc ? draft.financParcelasQtde : draft.cartaoParcelasQtde);
  const parcela = numero(usaFinanc ? draft.financParcelaValor : draft.cartaoParcelaValor);
  const insight = computePagamentoInsight({
    formaPagamento: draft.formaPagamento,
    parcelasQtde: qtde,
    parcelaValor: parcela,
    valorFinanciado: financValorEfetivo,
    totalEntradas: resumo.totalEntradas,
    valorTotal: numero(draft.valorTotal),
    desconto: numero(draft.desconto)
  });

  const linhas: Array<[string, string | null]> = [
    ["Valor da venda", formatValor(numero(draft.valorTotal))],
    ["Desconto", numero(draft.desconto) ? `− ${formatValor(numero(draft.desconto))}` : null],
    ["Entradas", resumo.totalEntradas > 0 ? formatValor(resumo.totalEntradas) : null],
    [draft.formaPagamento === "financiamento" ? "Financiado" : "Saldo", formatValor(draft.formaPagamento === "financiamento" ? financValorEfetivo : resumo.valorFinanciado)],
    ["Parcelas", insight.totalParcelas != null && qtde ? `${qtde}× ${formatValor(parcela)}` : null],
    ["Juros embutidos", insight.jurosEmbutidos != null ? `${insight.jurosEmbutidos >= 0 ? "+" : "−"} ${formatValor(Math.abs(insight.jurosEmbutidos))}` : null]
  ];

  return (
    <dl className={styles.summary} data-testid="vender-resumo">
      <p className={styles.summaryTitle}>Resumo</p>
      {linhas
        .filter(([, valor]) => valor != null)
        .map(([label, valor]) => (
          <div key={label} className={styles.summaryRow}>
            <dt>{label}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
        <dt>Total pago pelo cliente</dt>
        <dd>{formatValor(insight.custoTotalCliente ?? resumo.valorLiquido) ?? "—"}</dd>
      </div>
    </dl>
  );
}

/**
 * Etapa 4: confere tudo antes de salvar — inclusive as FRASES que vão para os
 * documentos (pagamento, transferência, IPVA, troca), montadas pela venda.
 */
export function StepRevisao({ contexto, resumo }: { contexto: VendaDocContext; resumo: VendaResumo }) {
  const [copiada, setCopiada] = useState(false);
  const clausulas = useMemo(
    () =>
      [
        ["Forma de pagamento", clausulaPagamento(contexto)],
        ["Veículo da troca", clausulaTroca(contexto)],
        ["Transferência", clausulaTransferencia(contexto)],
        ["IPVA", clausulaIpva(contexto)],
        ["Débitos", descreverDebitos(contexto.debitos, contexto.debitosValor)],
        ["Débitos da troca", descreverDebitos(primeiraTroca(contexto)?.debitos, primeiraTroca(contexto)?.debitosValor)]
      ].filter(([, texto]) => texto.trim()),
    [contexto]
  );

  const mensagem = useMemo(
    () =>
      buildMensagemVenda({
        carro: {
          modelo: contexto.modelo,
          placa: contexto.placa,
          cor: contexto.cor,
          anoFab: contexto.anoFab,
          anoMod: contexto.anoMod,
          hodometro: contexto.hodometro,
          anoIpvaPago: contexto.anoIpvaPago
        },
        venda: {
          valorTotal: contexto.valorTotal,
          desconto: contexto.desconto,
          formaPagamento: contexto.formaPagamento,
          financValor: contexto.financValor,
          financBanco: contexto.financBanco,
          financParcelasQtde: contexto.financParcelasQtde,
          financParcelaValor: contexto.financParcelaValor,
          cartaoParcelasQtde: contexto.cartaoParcelasQtde,
          cartaoParcelaValor: contexto.cartaoParcelaValor,
          tipoTransferencia: contexto.tipoTransferencia
        },
        entradas: contexto.entradas ?? []
      }),
    [contexto]
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiada(true);
      window.setTimeout(() => setCopiada(false), 2000);
    } catch {
      void copyDialog({ title: "Copie a mensagem da venda", value: mensagem });
    }
  }

  return (
    <>
      {resumo.entradasExcedemTotal ? (
        <p className={`${styles.alert} ${styles.alertDanger}`} data-testid="vender-resumo-inconsistente">
          <Icon name="alert" size={16} />
          As entradas + desconto passam do valor da venda. Revise antes de salvar.
        </p>
      ) : null}

      <section className={styles.card} aria-label="Comprador e veículo">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Comprador e veículo</h3>
        </div>
        <dl className={styles.kv}>
          <dt>Comprador</dt>
          <dd>{contexto.compradorNome || "—"}</dd>
          <dt>CPF/CNPJ</dt>
          <dd>{contexto.compradorDocumento || "—"}</dd>
          <dt>Contato</dt>
          <dd>{[contexto.compradorTelefone, contexto.compradorEmail].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Endereço</dt>
          <dd>{[contexto.compradorEndereco, contexto.compradorCidadeEstado, contexto.compradorCep].filter(Boolean).join(", ") || "—"}</dd>
          <dt>Veículo</dt>
          <dd>{[contexto.modelo, contexto.placa, contexto.cor].filter(Boolean).join(" · ")}</dd>
        </dl>
      </section>

      <section className={styles.card} aria-label="Como sai nos documentos" data-testid="vender-clausulas">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Como sai nos documentos</h3>
          <span className={styles.cardSub}>Montado pela venda — sem template por caso.</span>
        </div>
        {clausulas.map(([titulo, texto]) => (
          <p key={titulo} className={styles.clausula}>
            <small>{titulo}</small>
            {texto.toLocaleUpperCase("pt-BR")}
          </p>
        ))}
      </section>

      <section className={styles.card} aria-label="Mensagem da venda">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Mensagem da venda</h3>
          <span className={styles.spacer} />
          <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => void copiar()} data-testid="vender-mensagem-copiar">
            <Icon name={copiada ? "check" : "copy"} size={14} />
            {copiada ? "Copiada" : "Copiar"}
          </button>
        </div>
        <p className={styles.mensagem} data-testid="vender-mensagem">
          {mensagem}
        </p>
      </section>
    </>
  );
}
