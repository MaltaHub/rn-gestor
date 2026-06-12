/**
 * lib/domain/vendas/calculo.ts
 *
 * Funcoes puras do Vendas 2.0 (testaveis sem Supabase):
 * - `computeVendaResumo`: total de entradas + valor financiado
 *   (valor_total - desconto - soma das entradas, nunca negativo).
 * - `buildMensagemVenda`: mensagem final exibida ao vendedor ao fechar a ficha
 *   (tambem exposta ao Word via token `${mensagem.venda}`).
 */

export type EntradaResumo = {
  tipo?: string | null;
  valor?: number | null;
};

export type VendaResumoInput = {
  valorTotal?: number | null;
  desconto?: number | null;
  entradas?: EntradaResumo[] | null;
};

export type VendaResumo = {
  totalEntradas: number;
  /** valor_total - desconto (null quando valor_total ausente). */
  valorLiquido: number | null;
  /** valorLiquido - totalEntradas, clampado em 0 (null quando valor_total ausente). */
  valorFinanciado: number | null;
  /** Entradas + desconto excedem o valor da venda — ficha inconsistente. */
  entradasExcedemTotal: boolean;
};

function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeVendaResumo(input: VendaResumoInput): VendaResumo {
  const totalEntradas = (input.entradas ?? []).reduce((sum, e) => sum + safeNumber(e.valor), 0);

  if (input.valorTotal == null || !Number.isFinite(input.valorTotal)) {
    return { totalEntradas, valorLiquido: null, valorFinanciado: null, entradasExcedemTotal: false };
  }

  const valorLiquido = input.valorTotal - safeNumber(input.desconto);
  const restante = valorLiquido - totalEntradas;
  return {
    totalEntradas,
    valorLiquido,
    valorFinanciado: Math.max(0, restante),
    entradasExcedemTotal: restante < 0
  };
}

export type PagamentoInsightInput = {
  formaPagamento?: string | null;
  /** Parcelas da forma ativa (financ_* para financiamento/consorcio, cartao_* para cartao). */
  parcelasQtde?: number | null;
  parcelaValor?: number | null;
  /** Valor financiado efetivo (digitado ou calculado) — so financiamento. */
  valorFinanciado?: number | null;
  totalEntradas?: number | null;
  valorTotal?: number | null;
  desconto?: number | null;
};

export type PagamentoInsight = {
  /** qtde x valor da parcela. */
  totalParcelas: number | null;
  /** totalParcelas - valorFinanciado (juros/encargos embutidos) — so financiamento. */
  jurosEmbutidos: number | null;
  /** Quanto o cliente desembolsa no total: entradas + parcelas (ou o liquido, a vista). */
  custoTotalCliente: number | null;
};

export function computePagamentoInsight(input: PagamentoInsightInput): PagamentoInsight {
  const qtde = input.parcelasQtde;
  const parcela = input.parcelaValor;
  const totalParcelas =
    qtde != null && qtde > 0 && parcela != null && Number.isFinite(parcela) && parcela > 0
      ? Math.round(qtde * parcela * 100) / 100
      : null;

  let jurosEmbutidos: number | null = null;
  if (
    input.formaPagamento === "financiamento" &&
    totalParcelas != null &&
    input.valorFinanciado != null &&
    Number.isFinite(input.valorFinanciado)
  ) {
    jurosEmbutidos = Math.round((totalParcelas - input.valorFinanciado) * 100) / 100;
  }

  let custoTotalCliente: number | null = null;
  if (input.formaPagamento === "a_vista_pix") {
    custoTotalCliente =
      input.valorTotal != null && Number.isFinite(input.valorTotal)
        ? input.valorTotal - safeNumber(input.desconto)
        : null;
  } else if (totalParcelas != null) {
    custoTotalCliente = Math.round((safeNumber(input.totalEntradas) + totalParcelas) * 100) / 100;
  }

  return { totalParcelas, jurosEmbutidos, custoTotalCliente };
}

export type MensagemVendaInput = {
  carro: {
    modelo?: string | null;
    placa?: string | null;
    cor?: string | null;
    anoFab?: number | null;
    anoMod?: number | null;
    hodometro?: number | null;
    anoIpvaPago?: number | null;
  };
  venda: {
    valorTotal?: number | null;
    desconto?: number | null;
    formaPagamento?: string | null;
    financValor?: number | null;
    financBanco?: string | null;
    financParcelasQtde?: number | null;
    financParcelaValor?: number | null;
    cartaoParcelasQtde?: number | null;
    cartaoParcelaValor?: number | null;
    tipoTransferencia?: string | null;
  };
  entradas?: EntradaResumo[] | null;
  /** Injetavel nos testes; default = ano corrente. */
  anoAtual?: number;
};

const ENTRADA_TIPO_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao_credito: "cartão de crédito",
  carro_troca: "carro na troca",
  outro: "outra"
};

// Frase para entrada unica: "no PIX" / "no cartão" / "em carro na troca".
const ENTRADA_TIPO_FRASE: Record<string, string> = {
  pix: "no PIX",
  cartao_credito: "no cartão de crédito",
  carro_troca: "em carro na troca",
  outro: ""
};

const TRANSFERENCIA_LABEL: Record<string, string> = {
  loja: "pela loja",
  financiamento: "pelo financiamento",
  cliente: "pelo cliente"
};

function formatBRL(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatKm(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR").format(value);
}

/**
 * Monta a mensagem final da venda, em CAIXA ALTA (pronta para enviar ao
 * cliente/grupo). Segmentos com dado ausente sao omitidos, entao a mensagem
 * degrada de forma legivel em fichas incompletas.
 */
export function buildMensagemVenda(input: MensagemVendaInput): string {
  const { carro, venda } = input;
  const entradas = (input.entradas ?? []).filter((e) => safeNumber(e.valor) > 0);
  const anoAtual = input.anoAtual ?? new Date().getFullYear();
  const resumo = computeVendaResumo({
    valorTotal: venda.valorTotal,
    desconto: venda.desconto,
    entradas
  });

  const cabecalho: string[] = [];
  if (carro.modelo) cabecalho.push(`Veículo ${carro.modelo}`);
  if (carro.placa) cabecalho.push(`placa ${carro.placa}`);
  if (carro.cor) cabecalho.push(`cor ${carro.cor}`);
  if (carro.anoFab != null || carro.anoMod != null) {
    cabecalho.push(`ano/modelo ${carro.anoFab ?? "?"}/${carro.anoMod ?? "?"}`);
  }
  const km = formatKm(carro.hodometro);
  if (km) cabecalho.push(`${km} km`);

  const partes: string[] = [];
  const total = formatBRL(venda.valorTotal);
  partes.push(total ? `vendido pelo valor total de ${total}` : "vendido");

  const descontoFmt = formatBRL(venda.desconto);
  if (descontoFmt && safeNumber(venda.desconto) > 0) {
    partes.push(`com desconto de ${descontoFmt}`);
  }

  if (entradas.length > 0) {
    const totalEntradasFmt = formatBRL(resumo.totalEntradas);
    const detalhe = entradas
      .map((e) => {
        const label = ENTRADA_TIPO_LABEL[e.tipo ?? ""] ?? e.tipo ?? "entrada";
        const valor = formatBRL(e.valor);
        return valor ? `${label} ${valor}` : label;
      })
      .join(" + ");
    if (entradas.length > 1) {
      partes.push(`entrada de ${totalEntradasFmt} (${detalhe})`);
    } else {
      const frase = ENTRADA_TIPO_FRASE[entradas[0].tipo ?? ""] ?? "";
      partes.push(`entrada de ${totalEntradasFmt}${frase ? ` ${frase}` : ""}`);
    }
  }

  const parcelas = (qtde?: number | null, valor?: number | null) => {
    if (!qtde) return "";
    const parcela = formatBRL(valor);
    return ` em ${qtde}x${parcela ? ` de ${parcela}` : ""}`;
  };

  switch (venda.formaPagamento) {
    case "financiamento": {
      const financ = formatBRL(venda.financValor ?? resumo.valorFinanciado);
      let trecho = financ ? `financiado ${financ}` : "financiado";
      if (venda.financBanco) trecho += ` no banco ${venda.financBanco}`;
      trecho += parcelas(venda.financParcelasQtde, venda.financParcelaValor);
      partes.push(trecho);
      break;
    }
    case "a_vista_pix":
      partes.push("pago à vista no PIX");
      break;
    case "cartao_credito":
      partes.push(`pago no cartão de crédito${parcelas(venda.cartaoParcelasQtde, venda.cartaoParcelaValor)}`);
      break;
    case "consorcio": {
      let trecho = "pago por consórcio";
      if (venda.financBanco) trecho += ` pela ${venda.financBanco}`;
      trecho += parcelas(venda.financParcelasQtde, venda.financParcelaValor);
      partes.push(trecho);
      break;
    }
    default:
      break;
  }

  const transferencia = TRANSFERENCIA_LABEL[venda.tipoTransferencia ?? ""];
  if (transferencia) partes.push(`transferência ${transferencia}`);

  if (carro.anoIpvaPago != null && carro.anoIpvaPago === anoAtual) {
    partes.push("com IPVA PAGO");
  }

  const inicio = cabecalho.length > 0 ? `${cabecalho.join(", ")} — ` : "";
  return `${inicio}${partes.join(", ")}.`.toUpperCase();
}
