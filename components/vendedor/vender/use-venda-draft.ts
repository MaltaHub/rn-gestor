"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDecimal, parseInteiro } from "@/components/vendedor/format";
import { computeVendaResumo, type VendaResumo } from "@/lib/domain/vendas/calculo";
import type { EntradaTipo, FormaPagamento, PropositoVeiculo, TipoTransferencia } from "@/lib/domain/vendas/schemas";
import { hojeIso } from "@/lib/domain/vendas/situacao";
import { isValidCEP, isValidCpfCnpj, isValidEmail, isValidRG, isValidTelefone, onlyDigits } from "@/lib/domain/vendas/validacao";
import type { CarroPainel, VendaAtiva } from "@/lib/domain/vendedor/types";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import type { CreateVendaV2Payload, VendaEntradaPayload } from "@/components/vendedor/vender/api";

export const VALOR_TRANSFERENCIA_LOJA_DEFAULT = "990,00";

export type TrocaDraft = {
  placa: string;
  /** Nome do modelo (do catálogo ou novo — o servidor cadastra se não existir). */
  modelo: string;
  /** Onde o carro vai ficar (lookup_locations). */
  local: string;
  /** Declarado pelo vendedor: VENDA (vitrine) ou REPASSE. */
  proposito: "" | PropositoVeiculo;
  cor: string;
  anoFab: string;
  anoMod: string;
  hodometro: string;
  chassi: string;
  renavam: string;
};

export type EntradaDraft = {
  key: string;
  tipo: EntradaTipo;
  valor: string;
  cartaoParcelasQtde: string;
  cartaoParcelaValor: string;
  troca: TrocaDraft;
  /** Carro de troca JÁ cadastrado (edição de venda) — sub-form vira read-only. */
  carroTrocaId: string | null;
  /** Rótulo do carro da troca já cadastrado (placa · modelo). */
  trocaRotulo: string | null;
  descricao: string;
  /** Débitos do veículo da TROCA: o que é + o total. Só registro (não abate do valor). */
  debitos: string;
  debitosValor: string;
};

export type VendaDraft = {
  vendedorAuthUserId: string;
  dataVenda: string;
  dataEntrega: string;
  canalCliente: string;
  compradorNome: string;
  compradorDocumento: string;
  compradorRg: string;
  compradorTelefone: string;
  compradorEmail: string;
  compradorEndereco: string;
  compradorCep: string;
  compradorCidadeEstado: string;
  valorTotal: string;
  desconto: string;
  /** Débitos do veículo vendido: o que é (e quem paga) + o total. */
  debitos: string;
  debitosValor: string;
  formaPagamento: FormaPagamento;
  financBanco: string;
  financValor: string;
  financParcelasQtde: string;
  financParcelaValor: string;
  cartaoParcelasQtde: string;
  cartaoParcelaValor: string;
  entradas: EntradaDraft[];
  tipoTransferencia: TipoTransferencia;
  valorTransferencia: string;
  observacao: string;
  /** IPVA do ano confirmado como pago nesta venda (grava no cadastro do carro ao salvar). */
  confirmarIpva: boolean;
};

const EMPTY_TROCA: TrocaDraft = { placa: "", modelo: "", local: "", proposito: "", cor: "", anoFab: "", anoMod: "", hodometro: "", chassi: "", renavam: "" };

export function novaEntrada(tipo: EntradaTipo = "pix"): EntradaDraft {
  return {
    key: `entrada-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    valor: "",
    cartaoParcelasQtde: "",
    cartaoParcelaValor: "",
    troca: { ...EMPTY_TROCA },
    carroTrocaId: null,
    trocaRotulo: null,
    descricao: "",
    debitos: "",
    debitosValor: ""
  };
}

/** Número do banco -> texto de input BR ("1250.5" -> "1250,50"). */
function toInputDecimal(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "";
}

function toInputInt(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function toInputText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Rascunho de uma venda NOVA para o carro: preço do anúncio e data de hoje. */
export function novoDraft(carro: CarroPainel, vendedorAuthUserId: string): VendaDraft {
  return {
    vendedorAuthUserId,
    dataVenda: hojeIso(),
    dataEntrega: "",
    canalCliente: "",
    compradorNome: "",
    compradorDocumento: "",
    compradorRg: "",
    compradorTelefone: "",
    compradorEmail: "",
    compradorEndereco: "",
    compradorCep: "",
    compradorCidadeEstado: "",
    valorTotal: toInputDecimal(carro.preco),
    desconto: "",
    debitos: "",
    debitosValor: "",
    formaPagamento: "a_vista_pix",
    financBanco: "",
    financValor: "",
    financParcelasQtde: "",
    financParcelaValor: "",
    cartaoParcelasQtde: "",
    cartaoParcelaValor: "",
    entradas: [],
    tipoTransferencia: "loja",
    valorTransferencia: VALOR_TRANSFERENCIA_LOJA_DEFAULT,
    observacao: "",
    confirmarIpva: false
  };
}

/** Rascunho a partir de uma venda existente (reserva ou venda concluída). */
export function draftFromVenda(carro: CarroPainel, venda: VendaAtiva): VendaDraft {
  const base = novoDraft(carro, toInputText(venda.vendedor_auth_user_id));
  const entradas: EntradaDraft[] = (venda.venda_entradas ?? []).map((entrada, index) => ({
    key: `entrada-existente-${entrada.id ?? index}`,
    tipo: entrada.tipo,
    valor: toInputDecimal(entrada.valor),
    cartaoParcelasQtde: toInputInt(entrada.cartao_parcelas_qtde),
    cartaoParcelaValor: toInputDecimal(entrada.cartao_parcela_valor),
    troca: { ...EMPTY_TROCA },
    carroTrocaId: entrada.carro_troca_id ?? null,
    trocaRotulo: entrada.troca ? [entrada.troca.placa, entrada.troca.modelo].filter(Boolean).join(" · ") : null,
    descricao: toInputText(entrada.descricao),
    debitos: toInputText(entrada.debitos),
    debitosValor: toInputDecimal(entrada.debitos_valor)
  }));
  const tipo = venda.tipo_transferencia;
  return {
    ...base,
    dataVenda: toInputText(venda.data_venda) || base.dataVenda,
    dataEntrega: toInputText(venda.data_entrega),
    canalCliente: toInputText(venda.canal_cliente),
    compradorNome: toInputText(venda.comprador_nome),
    compradorDocumento: toInputText(venda.comprador_documento),
    compradorRg: toInputText(venda.comprador_rg),
    compradorTelefone: toInputText(venda.comprador_telefone),
    compradorEmail: toInputText(venda.comprador_email),
    compradorEndereco: toInputText(venda.comprador_endereco),
    compradorCep: toInputText(venda.comprador_cep),
    compradorCidadeEstado: toInputText(venda.comprador_cidade_estado),
    valorTotal: toInputDecimal(venda.valor_total) || base.valorTotal,
    desconto: toInputDecimal(venda.desconto),
    debitos: toInputText(venda.debitos),
    debitosValor: toInputDecimal(venda.debitos_valor),
    formaPagamento: (toInputText(venda.forma_pagamento) || "a_vista_pix") as FormaPagamento,
    financBanco: toInputText(venda.financ_banco),
    financValor: toInputDecimal(venda.financ_valor),
    financParcelasQtde: toInputInt(venda.financ_parcelas_qtde),
    financParcelaValor: toInputDecimal(venda.financ_parcela_valor),
    cartaoParcelasQtde: toInputInt(venda.cartao_parcelas_qtde),
    cartaoParcelaValor: toInputDecimal(venda.cartao_parcela_valor),
    entradas,
    tipoTransferencia: tipo === "loja" || tipo === "financiamento" || tipo === "cliente" ? tipo : "loja",
    valorTransferencia: toInputDecimal(venda.valor_transferencia) || (tipo === "loja" || !tipo ? VALOR_TRANSFERENCIA_LOJA_DEFAULT : ""),
    observacao: toInputText(venda.observacao)
  };
}

function numero(value: string): number | null {
  const parsed = parseDecimal(value);
  return parsed != null && !Number.isNaN(parsed) ? parsed : null;
}

function inteiro(value: string): number | null {
  const parsed = parseInteiro(value);
  return parsed != null && !Number.isNaN(parsed) ? parsed : null;
}

/** CPF (11 dígitos) = pessoa física: exige RG. */
export function pessoaFisica(documento: string): boolean {
  return onlyDigits(documento).length === 11;
}

export const ETAPAS = [
  { key: "comprador", label: "Comprador" },
  { key: "negociacao", label: "Negociação" },
  { key: "condicoes", label: "Condições" },
  { key: "revisao", label: "Revisão" }
] as const;

export type EtapaKey = (typeof ETAPAS)[number]["key"];
export type Pendencia = { field: string; message: string };

/** Primeira pendência da etapa (campo + mensagem), ou null se a etapa está ok. */
export function validarEtapa(draft: VendaDraft, etapa: EtapaKey, financValorEfetivo: number | null): Pendencia | null {
  if (etapa === "comprador") {
    // Obrigatórios (decisão do Kaic, 2026-11-10): tudo o que sai no recibo, menos o e-mail.
    if (!draft.compradorNome.trim()) return { field: "compradorNome", message: "Informe o nome do comprador." };
    if (!draft.compradorDocumento.trim()) return { field: "compradorDocumento", message: "Informe o CPF ou CNPJ do comprador." };
    if (!isValidCpfCnpj(draft.compradorDocumento)) return { field: "compradorDocumento", message: "CPF/CNPJ inválido." };
    if (pessoaFisica(draft.compradorDocumento)) {
      if (!draft.compradorRg.trim()) return { field: "compradorRg", message: "Informe o RG do comprador." };
      if (!isValidRG(draft.compradorRg)) return { field: "compradorRg", message: "RG inválido." };
    } else if (draft.compradorRg.trim() && !isValidRG(draft.compradorRg)) {
      return { field: "compradorRg", message: "RG inválido." };
    }
    if (!draft.compradorTelefone.trim()) return { field: "compradorTelefone", message: "Informe o telefone do comprador." };
    if (!isValidTelefone(draft.compradorTelefone)) return { field: "compradorTelefone", message: "Telefone inválido." };
    if (!draft.compradorCep.trim()) return { field: "compradorCep", message: "Informe o CEP do comprador." };
    if (!isValidCEP(draft.compradorCep)) return { field: "compradorCep", message: "CEP deve ter 8 dígitos." };
    if (!draft.compradorEndereco.trim()) return { field: "compradorEndereco", message: "Informe o endereço do comprador." };
    if (!draft.compradorCidadeEstado.trim()) return { field: "compradorCidadeEstado", message: "Informe a cidade e o estado." };
    if (draft.compradorEmail.trim() && !isValidEmail(draft.compradorEmail)) return { field: "compradorEmail", message: "E-mail inválido." };
    if (!draft.vendedorAuthUserId.trim()) return { field: "vendedorAuthUserId", message: "Selecione o vendedor responsável." };
    return null;
  }
  if (etapa === "negociacao") {
    const valorTotal = parseDecimal(draft.valorTotal);
    if (valorTotal == null) return { field: "valorTotal", message: "Informe o valor da venda." };
    if (Number.isNaN(valorTotal) || valorTotal <= 0) return { field: "valorTotal", message: "Valor da venda inválido (ex.: 50000,00)." };
    const desconto = parseDecimal(draft.desconto);
    if (desconto != null && Number.isNaN(desconto)) return { field: "desconto", message: "Desconto inválido." };
    for (const [index, entrada] of draft.entradas.entries()) {
      const valor = numero(entrada.valor);
      if (valor == null || valor <= 0) return { field: `entrada-${index}-valor`, message: `Entrada ${index + 1}: informe o valor.` };
      if (entrada.tipo === "cartao_credito" && !inteiro(entrada.cartaoParcelasQtde))
        return { field: `entrada-${index}-cartaoParcelas`, message: `Entrada ${index + 1}: informe as parcelas do cartão.` };
      if (entrada.tipo === "carro_troca" && !entrada.carroTrocaId) {
        const troca = entrada.troca;
        if (troca.placa.replace(/[^A-Za-z0-9]/g, "").length < 7)
          return { field: `entrada-${index}-trocaPlaca`, message: "Informe a placa do veículo da troca." };
        if (!troca.modelo.trim()) return { field: `entrada-${index}-trocaModelo`, message: "Informe o modelo do veículo da troca." };
        if (!troca.local) return { field: `entrada-${index}-trocaLocal`, message: "Informe onde o veículo da troca vai ficar." };
        if (!troca.proposito) return { field: `entrada-${index}-trocaProposito`, message: "Declare se o veículo da troca é para venda ou repasse." };
        for (const [campo, valor] of [["anoFab", troca.anoFab], ["anoMod", troca.anoMod], ["hodometro", troca.hodometro]] as const) {
          if (valor.trim() && inteiro(valor) == null) return { field: `entrada-${index}-troca-${campo}`, message: "Ano/KM do veículo da troca inválido." };
        }
      }
      if (entrada.tipo === "carro_troca" && entrada.debitosValor.trim() && (numero(entrada.debitosValor) == null || (numero(entrada.debitosValor) ?? 0) < 0))
        return { field: `entrada-${index}-trocaDebitosValor`, message: "Valor dos débitos da troca inválido (ex.: 1250,00)." };
    }
    const exigeParcelas = (qtdeRaw: string, valorRaw: string, rotulo: string, fieldQtde: string, fieldValor: string): Pendencia | null => {
      const qtde = inteiro(qtdeRaw);
      if (!qtde || qtde <= 0) return { field: fieldQtde, message: `Informe a quantidade de parcelas ${rotulo}.` };
      const parcela = numero(valorRaw);
      if (parcela == null || parcela <= 0) return { field: fieldValor, message: `Informe o valor da parcela ${rotulo}.` };
      return null;
    };
    if (draft.formaPagamento === "financiamento") {
      const digitado = parseDecimal(draft.financValor);
      if (digitado != null && Number.isNaN(digitado)) return { field: "financValor", message: "Valor financiado inválido." };
      if (financValorEfetivo == null || financValorEfetivo <= 0)
        return { field: "financValor", message: "Defina o valor financiado (ou ajuste valor e entradas para calcular)." };
      return exigeParcelas(draft.financParcelasQtde, draft.financParcelaValor, "do financiamento", "financParcelasQtde", "financParcelaValor");
    }
    if (draft.formaPagamento === "consorcio") {
      return exigeParcelas(draft.financParcelasQtde, draft.financParcelaValor, "do consórcio", "financParcelasQtde", "financParcelaValor");
    }
    if (draft.formaPagamento === "cartao_credito") {
      return exigeParcelas(draft.cartaoParcelasQtde, draft.cartaoParcelaValor, "do cartão", "cartaoParcelasQtde", "cartaoParcelaValor");
    }
    return null;
  }
  if (etapa === "condicoes") {
    const debitosValor = parseDecimal(draft.debitosValor);
    if (debitosValor != null && (Number.isNaN(debitosValor) || debitosValor < 0))
      return { field: "debitosValor", message: "Valor dos débitos inválido (ex.: 1250,00)." };
    const transferencia = parseDecimal(draft.valorTransferencia);
    if (transferencia != null && Number.isNaN(transferencia)) return { field: "valorTransferencia", message: "Valor da transferência inválido." };
    if (draft.dataVenda && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dataVenda)) return { field: "dataVenda", message: "Data da venda inválida." };
    return null;
  }
  return null;
}

export type BuildPayloadResult = { payload: CreateVendaV2Payload } | { error: Pendencia };

export function buildVendaPayload(draft: VendaDraft, carroId: string, financValorEfetivo: number | null): BuildPayloadResult {
  for (const etapa of ETAPAS) {
    const pendencia = validarEtapa(draft, etapa.key, financValorEfetivo);
    if (pendencia) return { error: pendencia };
  }

  const entradas: VendaEntradaPayload[] = draft.entradas.map((entrada) => {
    const item: VendaEntradaPayload = { tipo: entrada.tipo, valor: numero(entrada.valor) ?? 0 };
    if (entrada.tipo === "cartao_credito") {
      item.cartao_parcelas_qtde = inteiro(entrada.cartaoParcelasQtde);
      item.cartao_parcela_valor = numero(entrada.cartaoParcelaValor);
    }
    if (entrada.tipo === "carro_troca") {
      item.debitos = entrada.debitos.trim() || null;
      item.debitos_valor = numero(entrada.debitosValor);
      if (entrada.carroTrocaId) item.carro_troca_id = entrada.carroTrocaId;
      else
        item.carro_troca = {
          placa: entrada.troca.placa.trim().toUpperCase(),
          modelo: entrada.troca.modelo.trim(),
          local: entrada.troca.local,
          proposito: entrada.troca.proposito || "VENDA",
          cor: entrada.troca.cor.trim() || null,
          ano_fab: inteiro(entrada.troca.anoFab),
          ano_mod: inteiro(entrada.troca.anoMod),
          hodometro: inteiro(entrada.troca.hodometro),
          chassi: entrada.troca.chassi.trim() || null,
          renavam: entrada.troca.renavam.trim() || null
        };
    }
    if (entrada.descricao.trim()) item.descricao = entrada.descricao.trim();
    return item;
  });

  const forma = draft.formaPagamento;
  const usaFinanc = forma === "financiamento" || forma === "consorcio";
  const payload: CreateVendaV2Payload = {
    carro_id: carroId,
    vendedor_auth_user_id: draft.vendedorAuthUserId.trim(),
    forma_pagamento: forma,
    data_venda: draft.dataVenda.trim() || undefined,
    canal_cliente: draft.canalCliente.trim() || null,
    valor_total: numero(draft.valorTotal),
    desconto: numero(draft.desconto),
    debitos: draft.debitos.trim() || null,
    debitos_valor: numero(draft.debitosValor),
    comprador_nome: draft.compradorNome.trim() || null,
    comprador_documento: draft.compradorDocumento.trim() || null,
    comprador_rg: draft.compradorRg.trim() || null,
    comprador_telefone: draft.compradorTelefone.trim() || null,
    comprador_email: draft.compradorEmail.trim() || null,
    comprador_endereco: draft.compradorEndereco.trim() || null,
    comprador_cep: draft.compradorCep.trim() || null,
    comprador_cidade_estado: draft.compradorCidadeEstado.trim() || null,
    financ_banco: usaFinanc ? draft.financBanco.trim() || null : null,
    financ_valor: forma === "financiamento" ? financValorEfetivo : null,
    financ_parcelas_qtde: usaFinanc ? inteiro(draft.financParcelasQtde) : null,
    financ_parcela_valor: usaFinanc ? numero(draft.financParcelaValor) : null,
    cartao_parcelas_qtde: forma === "cartao_credito" ? inteiro(draft.cartaoParcelasQtde) : null,
    cartao_parcela_valor: forma === "cartao_credito" ? numero(draft.cartaoParcelaValor) : null,
    tipo_transferencia: draft.tipoTransferencia,
    valor_transferencia: numero(draft.valorTransferencia),
    observacao: draft.observacao.trim() || null,
    // Sempre presente: na edição, [] limpa as entradas da venda.
    entradas
  };
  return { payload };
}

/** Contexto dos documentos a partir do rascunho — a revisão mostra as cláusulas antes de salvar. */
export function contextoDoRascunho(draft: VendaDraft, carro: CarroPainel, financValorEfetivo: number | null, vendedorNome: string | null): VendaDocContext {
  const entradas = draft.entradas.map((entrada) => ({
    tipo: entrada.tipo,
    valor: numero(entrada.valor),
    descricao: entrada.descricao || null,
    cartaoParcelasQtde: inteiro(entrada.cartaoParcelasQtde),
    cartaoParcelaValor: numero(entrada.cartaoParcelaValor),
    debitos: entrada.tipo === "carro_troca" ? entrada.debitos || null : null,
    debitosValor: entrada.tipo === "carro_troca" ? numero(entrada.debitosValor) : null,
    troca:
      entrada.tipo === "carro_troca"
        ? entrada.carroTrocaId
          ? { placa: entrada.trocaRotulo }
          : {
              placa: entrada.troca.placa,
              modelo: entrada.troca.modelo,
              cor: entrada.troca.cor,
              anoFab: inteiro(entrada.troca.anoFab),
              anoMod: inteiro(entrada.troca.anoMod),
              hodometro: inteiro(entrada.troca.hodometro),
              chassi: entrada.troca.chassi,
              renavam: entrada.troca.renavam
            }
        : null
  }));
  return {
    placa: carro.placa,
    modelo: carro.modelo,
    cor: carro.cor,
    anoFab: carro.anoFab,
    anoMod: carro.anoMod,
    hodometro: carro.hodometro,
    anoIpvaPago: draft.confirmarIpva ? Number(draft.dataVenda.slice(0, 4)) || new Date().getFullYear() : carro.anoIpvaPago,
    chassi: carro.chassi,
    renavam: carro.renavam,
    temChaveReserva: carro.temChaveReserva,
    temManual: carro.temManual,
    valorTotal: numero(draft.valorTotal),
    valorEntrada: entradas.reduce((sum, entrada) => sum + (entrada.valor ?? 0), 0) || null,
    desconto: numero(draft.desconto),
    formaPagamento: draft.formaPagamento,
    dataVenda: draft.dataVenda || null,
    dataEntrega: draft.dataEntrega || null,
    observacao: draft.observacao || null,
    debitos: draft.debitos || null,
    debitosValor: numero(draft.debitosValor),
    compradorNome: draft.compradorNome || null,
    compradorDocumento: draft.compradorDocumento || null,
    compradorRg: draft.compradorRg || null,
    compradorTelefone: draft.compradorTelefone || null,
    compradorEmail: draft.compradorEmail || null,
    compradorEndereco: draft.compradorEndereco || null,
    compradorCep: draft.compradorCep || null,
    compradorCidadeEstado: draft.compradorCidadeEstado || null,
    financBanco: draft.financBanco || null,
    financValor: draft.formaPagamento === "financiamento" ? financValorEfetivo : null,
    financParcelasQtde: inteiro(draft.financParcelasQtde),
    financParcelaValor: numero(draft.financParcelaValor),
    cartaoParcelasQtde: inteiro(draft.cartaoParcelasQtde),
    cartaoParcelaValor: numero(draft.cartaoParcelaValor),
    tipoTransferencia: draft.tipoTransferencia,
    valorTransferencia: numero(draft.valorTransferencia),
    entradas,
    vendedor: vendedorNome
  };
}

const STORAGE_PREFIX = "rn.vender.rascunho.";
const RASCUNHO_VALIDADE_MS = 24 * 60 * 60 * 1000;

type RascunhoSalvo = { vendaId: string | null; draft: VendaDraft; salvoEm: number };

/**
 * Rascunho salvo por uma versão anterior da tela não tem os campos novos:
 * completa com o padrão (senão o form quebra ao ler um campo inexistente).
 */
export function completarRascunho(salvo: Partial<VendaDraft>, base: VendaDraft): VendaDraft {
  const vazia = novaEntrada();
  return {
    ...base,
    ...salvo,
    entradas: (salvo.entradas ?? base.entradas).map((entrada) => ({
      ...vazia,
      ...entrada,
      troca: { ...EMPTY_TROCA, ...(entrada.troca ?? {}) }
    }))
  };
}

function lerRascunho(carroId: string, vendaId: string | null): VendaDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + carroId);
    if (!raw) return null;
    const salvo = JSON.parse(raw) as RascunhoSalvo;
    if (salvo.vendaId !== vendaId || Date.now() - salvo.salvoEm > RASCUNHO_VALIDADE_MS) return null;
    return salvo.draft;
  } catch {
    return null;
  }
}

export function descartarRascunho(carroId: string) {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + carroId);
  } catch {
    // Sem storage: nada a limpar.
  }
}

/**
 * Estado do fluxo de venda de UM carro. Guarda o rascunho no navegador (24h)
 * enquanto o vendedor preenche — sair da tela e voltar não perde o que digitou.
 */
export function useVendaDraft(carro: CarroPainel, venda: VendaAtiva | null, vendedorPadrao: string) {
  const [recuperado, setRecuperado] = useState(false);
  const [draft, setDraft] = useState<VendaDraft>(() => {
    const salvo = typeof window !== "undefined" ? lerRascunho(carro.id, venda?.id ?? null) : null;
    const base = venda ? draftFromVenda(carro, venda) : novoDraft(carro, vendedorPadrao);
    return salvo ? completarRascunho(salvo, base) : base;
  });
  const alteradoRef = useRef(false);

  useEffect(() => {
    if (lerRascunho(carro.id, venda?.id ?? null)) setRecuperado(true);
    // Só na montagem: depois disso o rascunho é o estado vivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!alteradoRef.current) return;
    const timeout = window.setTimeout(() => {
      try {
        const salvo: RascunhoSalvo = { vendaId: venda?.id ?? null, draft, salvoEm: Date.now() };
        window.localStorage.setItem(STORAGE_PREFIX + carro.id, JSON.stringify(salvo));
      } catch {
        // Sem storage (aba privada): o rascunho vale só enquanto a tela está aberta.
      }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [carro.id, draft, venda?.id]);

  const patch = useCallback((changes: Partial<VendaDraft>) => {
    alteradoRef.current = true;
    setDraft((prev) => ({ ...prev, ...changes }));
  }, []);

  const addEntrada = useCallback((tipo: EntradaTipo = "pix") => {
    alteradoRef.current = true;
    setDraft((prev) => ({ ...prev, entradas: [...prev.entradas, novaEntrada(tipo)] }));
  }, []);

  const removeEntrada = useCallback((key: string) => {
    alteradoRef.current = true;
    setDraft((prev) => ({ ...prev, entradas: prev.entradas.filter((entrada) => entrada.key !== key) }));
  }, []);

  const patchEntrada = useCallback((key: string, changes: Partial<Omit<EntradaDraft, "key" | "troca">>) => {
    alteradoRef.current = true;
    setDraft((prev) => ({ ...prev, entradas: prev.entradas.map((entrada) => (entrada.key === key ? { ...entrada, ...changes } : entrada)) }));
  }, []);

  const patchEntradaTroca = useCallback((key: string, changes: Partial<TrocaDraft>) => {
    alteradoRef.current = true;
    setDraft((prev) => ({
      ...prev,
      entradas: prev.entradas.map((entrada) => (entrada.key === key ? { ...entrada, troca: { ...entrada.troca, ...changes } } : entrada))
    }));
  }, []);

  const descartar = useCallback(() => {
    descartarRascunho(carro.id);
    alteradoRef.current = false;
    setRecuperado(false);
    setDraft(venda ? draftFromVenda(carro, venda) : novoDraft(carro, vendedorPadrao));
  }, [carro, venda, vendedorPadrao]);

  // Resumo em tempo real (entradas com valor inválido contam como 0).
  const resumo: VendaResumo = useMemo(
    () =>
      computeVendaResumo({
        valorTotal: numero(draft.valorTotal),
        desconto: numero(draft.desconto),
        entradas: draft.entradas.map((entrada) => ({ tipo: entrada.tipo, valor: numero(entrada.valor) ?? 0 }))
      }),
    [draft.valorTotal, draft.desconto, draft.entradas]
  );

  /** financ_valor efetivo: o digitado, senão o calculado (venda − desconto − entradas). */
  const financValorEfetivo = useMemo(() => {
    if (draft.formaPagamento !== "financiamento") return null;
    return numero(draft.financValor) ?? resumo.valorFinanciado;
  }, [draft.formaPagamento, draft.financValor, resumo.valorFinanciado]);

  return {
    draft,
    patch,
    addEntrada,
    removeEntrada,
    patchEntrada,
    patchEntradaTroca,
    resumo,
    financValorEfetivo,
    recuperado,
    descartar
  };
}
