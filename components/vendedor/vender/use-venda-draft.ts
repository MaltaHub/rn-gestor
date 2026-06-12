"use client";

import { useCallback, useMemo, useState } from "react";
import type { VendedorCarroDetail } from "@/components/ui-grid/api";
import { parseDecimal, parseInteiro } from "@/components/vendedor/format";
import { computeVendaResumo, type VendaResumo } from "@/lib/domain/vendas/calculo";
import type { EntradaTipo, FormaPagamento, TipoTransferencia } from "@/lib/domain/vendas/schemas";
import type { CreateVendaV2Payload, VendaEntradaPayload } from "@/components/vendedor/vender/api";

export const VALOR_TRANSFERENCIA_LOJA_DEFAULT = "990,00";

export type TrocaDraft = {
  placa: string;
  nome: string;
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
};

export type VendaDraft = {
  carro: VendedorCarroDetail | null;
  vendedorAuthUserId: string;
  dataVenda: string;
  dataEntrega: string;
  canalCliente: string;
  compradorNome: string;
  compradorDocumento: string;
  compradorTelefone: string;
  compradorEmail: string;
  compradorEndereco: string;
  valorTotal: string;
  desconto: string;
  formaPagamento: FormaPagamento;
  financBanco: string;
  financValor: string;
  financParcelasQtde: string;
  financParcelaValor: string;
  cartaoParcelasQtde: string;
  cartaoParcelaValor: string;
  temEntrada: boolean;
  entradas: EntradaDraft[];
  tipoTransferencia: TipoTransferencia;
  valorTransferencia: string;
  observacao: string;
};

const EMPTY_TROCA: TrocaDraft = {
  placa: "",
  nome: "",
  cor: "",
  anoFab: "",
  anoMod: "",
  hodometro: "",
  chassi: "",
  renavam: ""
};

function newEntrada(tipo: EntradaTipo = "pix"): EntradaDraft {
  return {
    key: `entrada-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    valor: "",
    cartaoParcelasQtde: "",
    cartaoParcelaValor: "",
    troca: { ...EMPTY_TROCA }
  };
}

function initialDraft(vendedorAuthUserId: string): VendaDraft {
  return {
    carro: null,
    vendedorAuthUserId,
    dataVenda: "",
    dataEntrega: "",
    canalCliente: "",
    compradorNome: "",
    compradorDocumento: "",
    compradorTelefone: "",
    compradorEmail: "",
    compradorEndereco: "",
    valorTotal: "",
    desconto: "",
    formaPagamento: "financiamento",
    financBanco: "",
    financValor: "",
    financParcelasQtde: "",
    financParcelaValor: "",
    cartaoParcelasQtde: "",
    cartaoParcelaValor: "",
    temEntrada: false,
    entradas: [],
    tipoTransferencia: "loja",
    valorTransferencia: VALOR_TRANSFERENCIA_LOJA_DEFAULT,
    observacao: ""
  };
}

export type DraftPatch = Partial<Omit<VendaDraft, "entradas" | "carro">> & {
  carro?: VendedorCarroDetail | null;
};

export type BuildPayloadResult = { payload: CreateVendaV2Payload } | { error: string };

export function useVendaDraft(vendedorAuthUserId: string) {
  const [draft, setDraft] = useState<VendaDraft>(() => initialDraft(vendedorAuthUserId));

  const patch = useCallback((changes: DraftPatch) => {
    setDraft((prev) => ({ ...prev, ...changes }));
  }, []);

  const addEntrada = useCallback((tipo: EntradaTipo = "pix") => {
    setDraft((prev) => ({ ...prev, temEntrada: true, entradas: [...prev.entradas, newEntrada(tipo)] }));
  }, []);

  const removeEntrada = useCallback((key: string) => {
    setDraft((prev) => ({ ...prev, entradas: prev.entradas.filter((e) => e.key !== key) }));
  }, []);

  const patchEntrada = useCallback((key: string, changes: Partial<Omit<EntradaDraft, "key" | "troca">>) => {
    setDraft((prev) => ({
      ...prev,
      entradas: prev.entradas.map((e) => (e.key === key ? { ...e, ...changes } : e))
    }));
  }, []);

  const patchEntradaTroca = useCallback((key: string, changes: Partial<TrocaDraft>) => {
    setDraft((prev) => ({
      ...prev,
      entradas: prev.entradas.map((e) => (e.key === key ? { ...e, troca: { ...e.troca, ...changes } } : e))
    }));
  }, []);

  // Resumo em tempo real (entradas com valor invalido contam como 0).
  const resumo: VendaResumo = useMemo(() => {
    const valorTotal = parseDecimal(draft.valorTotal);
    const desconto = parseDecimal(draft.desconto);
    const entradas = draft.entradas.map((e) => {
      const valor = parseDecimal(e.valor);
      return { tipo: e.tipo, valor: valor != null && !Number.isNaN(valor) ? valor : 0 };
    });
    return computeVendaResumo({
      valorTotal: valorTotal != null && !Number.isNaN(valorTotal) ? valorTotal : null,
      desconto: desconto != null && !Number.isNaN(desconto) ? desconto : null,
      entradas
    });
  }, [draft.valorTotal, draft.desconto, draft.entradas]);

  /** financ_valor efetivo: o digitado, senao o calculado pelo resumo. */
  const financValorEfetivo: number | null = useMemo(() => {
    if (draft.formaPagamento !== "financiamento") return null;
    const digitado = parseDecimal(draft.financValor);
    if (digitado != null && !Number.isNaN(digitado)) return digitado;
    return resumo.valorFinanciado;
  }, [draft.formaPagamento, draft.financValor, resumo.valorFinanciado]);

  const buildPayload = useCallback((): BuildPayloadResult => {
    const d = draft;
    if (!d.carro) return { error: "Selecione o veículo." };
    if (!d.vendedorAuthUserId.trim()) return { error: "Selecione o vendedor responsável." };

    const valorTotal = parseDecimal(d.valorTotal);
    if (valorTotal == null) return { error: "Informe o valor da venda." };
    if (Number.isNaN(valorTotal)) return { error: "Valor da venda inválido. Use número com decimais (ex.: 50000,00)." };

    const numeros: Array<[string, number | null]> = [];
    const parse = (label: string, raw: string, parser: (v: string) => number | null) => {
      const parsed = parser(raw);
      if (parsed != null && Number.isNaN(parsed)) {
        numeros.push([label, NaN]);
        return null;
      }
      return parsed;
    };

    const desconto = parse("Desconto", d.desconto, parseDecimal);
    const financValor = parse("Valor financiado", d.financValor, parseDecimal);
    const financParcelasQtde = parse("Parcelas do financiamento", d.financParcelasQtde, parseInteiro);
    const financParcelaValor = parse("Valor da parcela", d.financParcelaValor, parseDecimal);
    const cartaoParcelasQtde = parse("Parcelas do cartão", d.cartaoParcelasQtde, parseInteiro);
    const cartaoParcelaValor = parse("Valor da parcela do cartão", d.cartaoParcelaValor, parseDecimal);
    const valorTransferencia = parse("Valor da transferência", d.valorTransferencia, parseDecimal);
    const invalido = numeros.find(([, v]) => Number.isNaN(v));
    if (invalido) return { error: `${invalido[0]}: valor inválido.` };

    const entradas: VendaEntradaPayload[] = [];
    for (const [index, entrada] of d.entradas.entries()) {
      const valor = parseDecimal(entrada.valor);
      if (valor == null || Number.isNaN(valor) || valor <= 0) {
        return { error: `Entrada ${index + 1}: informe um valor válido.` };
      }
      const item: VendaEntradaPayload = { tipo: entrada.tipo, valor };
      if (entrada.tipo === "cartao_credito") {
        const qtde = parseInteiro(entrada.cartaoParcelasQtde);
        if (qtde == null || Number.isNaN(qtde) || qtde <= 0) {
          return { error: `Entrada ${index + 1}: informe as parcelas do cartão.` };
        }
        const parcela = parseDecimal(entrada.cartaoParcelaValor);
        item.cartao_parcelas_qtde = qtde;
        item.cartao_parcela_valor = parcela != null && !Number.isNaN(parcela) ? parcela : null;
      }
      if (entrada.tipo === "carro_troca") {
        const placa = entrada.troca.placa.trim().toUpperCase();
        if (placa.length < 7) {
          return { error: `Entrada ${index + 1}: informe a placa do carro da troca.` };
        }
        const anoFab = parseInteiro(entrada.troca.anoFab);
        const anoMod = parseInteiro(entrada.troca.anoMod);
        const hodometro = parseInteiro(entrada.troca.hodometro);
        if ([anoFab, anoMod, hodometro].some((v) => v != null && Number.isNaN(v))) {
          return { error: `Entrada ${index + 1}: ano/KM do carro da troca inválido.` };
        }
        item.carro_troca = {
          placa,
          nome: entrada.troca.nome.trim() || null,
          cor: entrada.troca.cor.trim() || null,
          ano_fab: anoFab,
          ano_mod: anoMod,
          hodometro,
          chassi: entrada.troca.chassi.trim() || null,
          renavam: entrada.troca.renavam.trim() || null
        };
      }
      entradas.push(item);
    }

    const isFinanciamento = d.formaPagamento === "financiamento";
    const isConsorcio = d.formaPagamento === "consorcio";
    const isCartao = d.formaPagamento === "cartao_credito";

    const payload: CreateVendaV2Payload = {
      carro_id: String(d.carro.id),
      vendedor_auth_user_id: d.vendedorAuthUserId.trim(),
      forma_pagamento: d.formaPagamento,
      data_venda: d.dataVenda.trim() || undefined,
      data_entrega: d.dataEntrega.trim() || null,
      canal_cliente: d.canalCliente.trim() || null,
      valor_total: valorTotal,
      desconto,
      comprador_nome: d.compradorNome.trim() || null,
      comprador_documento: d.compradorDocumento.trim() || null,
      comprador_telefone: d.compradorTelefone.trim() || null,
      comprador_email: d.compradorEmail.trim() || null,
      comprador_endereco: d.compradorEndereco.trim() || null,
      financ_banco: isFinanciamento || isConsorcio ? d.financBanco.trim() || null : null,
      financ_valor: isFinanciamento ? financValor ?? resumo.valorFinanciado : null,
      financ_parcelas_qtde: isFinanciamento || isConsorcio ? financParcelasQtde : null,
      financ_parcela_valor: isFinanciamento || isConsorcio ? financParcelaValor : null,
      cartao_parcelas_qtde: isCartao ? cartaoParcelasQtde : null,
      cartao_parcela_valor: isCartao ? cartaoParcelaValor : null,
      tipo_transferencia: d.tipoTransferencia,
      valor_transferencia: valorTransferencia,
      observacao: d.observacao.trim() || null,
      entradas: entradas.length > 0 ? entradas : undefined
    };

    return { payload };
  }, [draft, resumo.valorFinanciado]);

  return {
    draft,
    patch,
    addEntrada,
    removeEntrada,
    patchEntrada,
    patchEntradaTroca,
    resumo,
    financValorEfetivo,
    buildPayload
  };
}
