/**
 * Cláusulas prontas dos documentos da venda: textos que se MONTAM conforme a
 * dinâmica da venda, para um único template servir a todos os casos (à vista,
 * financiado com ou sem entrada, troca, cartão, consórcio...). Sem isto cada
 * combinação virava um template ("Recibo financiado com entrada e IPVA pago").
 *
 * Funções puras sobre o VendaDocContext. Os textos saem em caixa normal — o
 * documento coloca tudo em CAIXA ALTA na resolução (resolveDoc).
 */
import type { VendaDocContext, VendaDocEntrada, VendaDocTroca } from "@/lib/domain/venda-documentos/contexto";
import {
  capitalizar,
  formatDataExtenso,
  formatKm,
  isNumero,
  juntarLista,
  somarDias,
  valorComExtenso
} from "@/lib/domain/venda-documentos/formato";
import { anoDaData } from "@/lib/domain/vendas/situacao";

/** Prazo da garantia legal de bem durável (CDC, art. 26, II). */
export const GARANTIA_LEGAL_DIAS = 90;

// Descrição automática do form rápido do grid — não é texto para documento.
const DESCRICAO_INTERNA = /^entrada registrada sem tipo/i;

export function entradasValidas(ctx: VendaDocContext): VendaDocEntrada[] {
  return (ctx.entradas ?? []).filter((entrada) => isNumero(entrada.valor) && entrada.valor > 0);
}

export function totalEntradas(ctx: VendaDocContext): number {
  const entradas = entradasValidas(ctx);
  if (entradas.length > 0) return entradas.reduce((sum, entrada) => sum + (entrada.valor ?? 0), 0);
  return isNumero(ctx.valorEntrada) ? ctx.valorEntrada : 0;
}

/** Valor negociado: valor da venda − desconto. */
export function valorFinal(ctx: VendaDocContext): number | null {
  if (!isNumero(ctx.valorTotal)) return null;
  return ctx.valorTotal - (isNumero(ctx.desconto) ? ctx.desconto : 0);
}

/** Saldo depois das entradas (o financiado digitado, quando houver). Nunca negativo. */
export function saldoAPagar(ctx: VendaDocContext): number | null {
  if (ctx.formaPagamento === "financiamento" && isNumero(ctx.financValor) && ctx.financValor > 0) return ctx.financValor;
  const final = valorFinal(ctx);
  if (final == null) return null;
  return Math.max(0, Math.round((final - totalEntradas(ctx)) * 100) / 100);
}

/** A (primeira) entrada com veículo na troca — base das variáveis ${TROCA.*}. */
export function primeiraTroca(ctx: VendaDocContext): VendaDocEntrada | null {
  return entradasValidas(ctx).find((entrada) => entrada.tipo === "carro_troca") ?? null;
}

export function temTroca(ctx: VendaDocContext): boolean {
  return entradasValidas(ctx).some((entrada) => entrada.tipo === "carro_troca");
}

/**
 * Débitos de um veículo numa linha: o que é e o total ("IPVA 2026 em aberto,
 * por conta do comprador — R$ 1.200,00 (mil e duzentos reais)"). Só o que
 * estiver preenchido; vazio quando não há débito.
 */
export function descreverDebitos(texto?: string | null, valor?: number | null): string {
  const descricao = texto?.trim() ?? "";
  const total = isNumero(valor) && valor > 0 ? valorComExtenso(valor) : "";
  return [descricao, total].filter(Boolean).join(" — ");
}

export function temDebitosInformados(texto?: string | null, valor?: number | null): boolean {
  return Boolean(texto?.trim()) || (isNumero(valor) && valor > 0);
}

function anos(anoFab?: number | null, anoMod?: number | null): string | null {
  if (!isNumero(anoFab) && !isNumero(anoMod)) return null;
  if (isNumero(anoFab) && isNumero(anoMod) && anoFab !== anoMod) return `${anoFab}/${anoMod}`;
  return String(anoMod ?? anoFab);
}

type VeiculoDescricao = VendaDocTroca & { completo?: boolean };

/** "Onix, placa ABC1D23, ano 2019/2020, cor prata" (+ chassi/renavam/KM com `completo`). */
export function descreverVeiculo(veiculo: VeiculoDescricao | null | undefined): string {
  if (!veiculo) return "";
  const partes: string[] = [];
  if (veiculo.modelo?.trim()) partes.push(veiculo.modelo.trim());
  if (veiculo.placa?.trim()) partes.push(`placa ${veiculo.placa.trim().toUpperCase()}`);
  const ano = anos(veiculo.anoFab, veiculo.anoMod);
  if (ano) partes.push(`ano ${ano}`);
  if (veiculo.cor?.trim()) partes.push(`cor ${veiculo.cor.trim()}`);
  if (veiculo.completo) {
    if (veiculo.chassi?.trim()) partes.push(`chassi ${veiculo.chassi.trim().toUpperCase()}`);
    if (veiculo.renavam?.trim()) partes.push(`renavam ${veiculo.renavam.trim()}`);
    const km = formatKm(veiculo.hodometro);
    if (km) partes.push(`${km} km`);
  }
  return partes.join(", ");
}

/** O veículo vendido, por completo (para contratos e termos). */
export function descricaoVeiculoVendido(ctx: VendaDocContext): string {
  return descreverVeiculo({
    modelo: ctx.modelo,
    placa: ctx.placa,
    anoFab: ctx.anoFab,
    anoMod: ctx.anoMod,
    cor: ctx.cor,
    chassi: ctx.chassi,
    renavam: ctx.renavam,
    hodometro: ctx.hodometro,
    completo: true
  });
}

function parcelas(qtde: number | null | undefined, valor: number | null | undefined): string {
  if (!isNumero(qtde) || qtde <= 0) return "";
  const parcela = valorComExtenso(valor);
  return ` em ${qtde} ${qtde === 1 ? "parcela" : "parcelas"}${parcela && (valor ?? 0) > 0 ? ` de ${parcela}` : ""}`;
}

/** Como a entrada foi paga: "via PIX", "no cartão de crédito em 10 parcelas...", "em veículo recebido na troca (...)". */
export function meioDaEntrada(entrada: VendaDocEntrada): string {
  switch (entrada.tipo) {
    case "pix":
      return "via PIX";
    case "cartao_credito":
      return `no cartão de crédito${parcelas(entrada.cartaoParcelasQtde, entrada.cartaoParcelaValor)}`;
    case "carro_troca": {
      const veiculo = descreverVeiculo(entrada.troca);
      return `em veículo recebido na troca${veiculo ? ` (${veiculo})` : ""}`;
    }
    default: {
      const descricao = entrada.descricao?.trim() ?? "";
      return descricao && !DESCRICAO_INTERNA.test(descricao) ? `em ${descricao.replace(/\.$/, "")}` : "";
    }
  }
}

function itemEntrada(entrada: VendaDocEntrada): string {
  return `${valorComExtenso(entrada.valor)} ${meioDaEntrada(entrada)}`.trim();
}

function nomeBanco(banco: string): string {
  const nome = banco.trim();
  return /^banco\b/i.test(nome) ? `pelo ${nome}` : `pelo banco ${nome}`;
}

/**
 * A forma de pagamento inteira, numa frase, conforme a venda. Exemplos:
 *  - "Pagamento à vista, via PIX, no valor de R$ 65.000,00 (sessenta e cinco mil reais)."
 *  - "Entrada de R$ 10.000,00 (dez mil reais) via PIX; saldo de R$ 55.000,00 (...)
 *     financiado pelo banco Santander em 48 parcelas de R$ 1.500,00 (...)."
 *  - "Entrada de R$ 30.000,00 (...), sendo R$ 20.000,00 (...) em veículo recebido na
 *     troca (Onix, placa ABC1D23...) e R$ 10.000,00 (...) via PIX; saldo de ..."
 * Sem valor da venda → "" (o documento não inventa forma de pagamento).
 */
export function clausulaPagamento(ctx: VendaDocContext): string {
  const final = valorFinal(ctx);
  if (final == null) return "";
  const entradas = entradasValidas(ctx);
  const total = entradas.reduce((sum, entrada) => sum + (entrada.valor ?? 0), 0);
  const saldo = saldoAPagar(ctx) ?? 0;
  const saldoTexto = saldo > 0 ? valorComExtenso(saldo) : null;
  const temEntrada = entradas.length > 0;

  // As entradas quitam tudo: não é "entrada", é o pagamento inteiro.
  if (temEntrada && !saldoTexto) {
    const detalhe =
      entradas.length === 1
        ? ` ${meioDaEntrada(entradas[0])}`.trimEnd()
        : `, sendo ${juntarLista(entradas.map(itemEntrada))}`;
    return `${capitalizar(`pagamento de ${valorComExtenso(total)}${detalhe}`)}.`;
  }

  const partes: string[] = [];
  if (entradas.length === 1) partes.push(`entrada de ${itemEntrada(entradas[0])}`);
  if (entradas.length > 1) {
    partes.push(`entrada de ${valorComExtenso(total)}, sendo ${juntarLista(entradas.map(itemEntrada))}`);
  }

  if (saldoTexto) {
    const rotulo = temEntrada ? "saldo de" : "valor de";
    switch (ctx.formaPagamento) {
      case "financiamento": {
        let trecho = `${rotulo} ${saldoTexto} financiado`;
        if (ctx.financBanco?.trim()) trecho += ` ${nomeBanco(ctx.financBanco)}`;
        partes.push(trecho + parcelas(ctx.financParcelasQtde, ctx.financParcelaValor));
        break;
      }
      case "consorcio": {
        let trecho = `${rotulo} ${saldoTexto} pago por carta de consórcio`;
        if (ctx.financBanco?.trim()) trecho += ` da administradora ${ctx.financBanco.trim()}`;
        partes.push(trecho + parcelas(ctx.financParcelasQtde, ctx.financParcelaValor));
        break;
      }
      case "cartao_credito": {
        const trecho = temEntrada ? `saldo de ${saldoTexto} no cartão de crédito` : `pagamento de ${saldoTexto} no cartão de crédito`;
        partes.push(trecho + parcelas(ctx.cartaoParcelasQtde, ctx.cartaoParcelaValor));
        break;
      }
      default:
        partes.push(temEntrada ? `saldo de ${saldoTexto} à vista, via PIX` : `pagamento à vista, via PIX, no valor de ${saldoTexto}`);
    }
  }

  if (partes.length === 0) return final > 0 ? `${capitalizar(`valor total de ${valorComExtenso(final)}`)}.` : "";
  return `${capitalizar(partes.join("; "))}.`;
}

/** Ano de referência dos tributos: o da data da venda (ou o atual). */
export function anoReferencia(ctx: VendaDocContext, now: Date = new Date()): number {
  return anoDaData(ctx.dataVenda) ?? now.getFullYear();
}

/** IPVA do ano da venda consta como pago no cadastro do veículo (carros.ano_ipva_pago). */
export function ipvaPago(ctx: VendaDocContext, now: Date = new Date()): boolean {
  return isNumero(ctx.anoIpvaPago) && ctx.anoIpvaPago >= anoReferencia(ctx, now);
}

/** "IPVA 2026 pago" quando o cadastro diz; vazio quando não (o débito vai em ${debitos}). */
export function clausulaIpva(ctx: VendaDocContext, now: Date = new Date()): string {
  return ipvaPago(ctx, now) ? `IPVA ${anoReferencia(ctx, now)} pago` : "";
}

export function clausulaTransferencia(ctx: VendaDocContext): string {
  switch (ctx.tipoTransferencia) {
    case "loja": {
      const valor = isNumero(ctx.valorTransferencia) && ctx.valorTransferencia > 0 ? valorComExtenso(ctx.valorTransferencia) : null;
      return `Transferência de propriedade realizada pela loja${valor ? `, no valor de ${valor}` : ""}.`;
    }
    case "financiamento":
      return "Transferência de propriedade realizada pela instituição financiadora.";
    case "cliente":
      return "Transferência de propriedade por conta do comprador, que deverá efetivá-la em até 30 (trinta) dias, conforme o art. 123 do Código de Trânsito Brasileiro.";
    default:
      return "";
  }
}

/** Veículo(s) recebido(s) na troca, com os dados completos e o valor de avaliação. */
export function clausulaTroca(ctx: VendaDocContext): string {
  const trocas = entradasValidas(ctx).filter((entrada) => entrada.tipo === "carro_troca");
  if (trocas.length === 0) return "";
  const itens = trocas.map((entrada) => {
    const veiculo = descreverVeiculo({ ...(entrada.troca ?? {}), completo: true }) || "veículo";
    return `${veiculo}, recebido pelo valor de ${valorComExtenso(entrada.valor)}`;
  });
  const sujeito = trocas.length > 1 ? "Veículos recebidos" : "Veículo recebido";
  return `${sujeito} como parte do pagamento: ${itens.join("; ")}.`;
}

export function garantiaFim(ctx: VendaDocContext): string | null {
  return somarDias(ctx.dataEntrega, GARANTIA_LEGAL_DIAS);
}

export function clausulaGarantia(ctx: VendaDocContext): string {
  const inicio = formatDataExtenso(ctx.dataEntrega);
  const fim = formatDataExtenso(garantiaFim(ctx));
  const periodo = inicio && fim ? `, de ${inicio} a ${fim}` : "";
  return `Garantia legal de 90 (noventa) dias, contados da entrega do veículo${periodo}, nos termos do art. 26, II, do Código de Defesa do Consumidor.`;
}

/** "Maria da Silva, CPF 123..., RG ..., residente em ..., CEP ..., telefone ..." */
export function qualificacaoComprador(ctx: VendaDocContext): string {
  const nome = ctx.compradorNome?.trim();
  if (!nome) return "";
  const partes = [nome];
  const documento = ctx.compradorDocumento?.trim();
  if (documento) partes.push(`${documento.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF"} ${documento}`);
  if (ctx.compradorRg?.trim()) partes.push(`RG ${ctx.compradorRg.trim()}`);
  const endereco = [ctx.compradorEndereco?.trim(), ctx.compradorCidadeEstado?.trim()].filter(Boolean).join(", ");
  if (endereco) partes.push(`residente em ${endereco}`);
  if (ctx.compradorCep?.trim()) partes.push(`CEP ${ctx.compradorCep.trim()}`);
  if (ctx.compradorTelefone?.trim()) partes.push(`telefone ${ctx.compradorTelefone.trim()}`);
  return partes.join(", ");
}

export function simNao(value: boolean | null | undefined): string {
  return value == null ? "" : value ? "sim" : "não";
}
