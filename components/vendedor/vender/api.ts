"use client";

import { apiFetch, parseEnvelope } from "@/lib/api/http-client";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type {
  EntradaTipo,
  FormaPagamento,
  TipoTransferencia,
  TrocaCarroNovoInput
} from "@/lib/domain/vendas/schemas";

export type VendaEntradaPayload = {
  tipo: EntradaTipo;
  valor: number;
  cartao_parcelas_qtde?: number | null;
  cartao_parcela_valor?: number | null;
  /** Sub-form para CADASTRAR o carro da troca (criação)... */
  carro_troca?: TrocaCarroNovoInput | null;
  /** ...ou referência a um carro já cadastrado (edição da venda). */
  carro_troca_id?: string | null;
  descricao?: string | null;
};

export type CreateVendaV2Payload = {
  carro_id: string;
  vendedor_auth_user_id: string;
  forma_pagamento: FormaPagamento;
  data_venda?: string;
  data_entrega?: string | null;
  canal_cliente?: string | null;
  valor_total?: number | null;
  desconto?: number | null;
  comprador_nome?: string | null;
  comprador_documento?: string | null;
  comprador_telefone?: string | null;
  comprador_email?: string | null;
  comprador_endereco?: string | null;
  financ_banco?: string | null;
  financ_valor?: number | null;
  financ_parcelas_qtde?: number | null;
  financ_parcela_valor?: number | null;
  cartao_parcelas_qtde?: number | null;
  cartao_parcela_valor?: number | null;
  tipo_transferencia?: TipoTransferencia | null;
  valor_transferencia?: number | null;
  observacao?: string | null;
  entradas?: VendaEntradaPayload[];
};

export type VendaCriada = Record<string, unknown> & { id: string; carro_id: string };

export async function createVendaV2(auth: RequestAuth, payload: CreateVendaV2Payload): Promise<VendaCriada> {
  const res = await apiFetch("/api/v1/vendas", {
    method: "POST",
    headers: buildRequestHeaders(auth),
    body: JSON.stringify(payload)
  });
  return parseEnvelope<VendaCriada>(res);
}

export async function updateVendaV2(
  auth: RequestAuth,
  vendaId: string,
  payload: Partial<CreateVendaV2Payload>
): Promise<VendaCriada> {
  const res = await apiFetch(`/api/v1/vendas/${vendaId}`, {
    method: "PATCH",
    headers: buildRequestHeaders(auth),
    body: JSON.stringify(payload)
  });
  return parseEnvelope<VendaCriada>(res);
}

export type VendaEntradaRow = {
  id: string;
  tipo: EntradaTipo;
  valor: number | null;
  cartao_parcelas_qtde: number | null;
  cartao_parcela_valor: number | null;
  carro_troca_id: string | null;
  descricao: string | null;
};

export type VendaExistente = Record<string, unknown> & {
  id: string;
  carro_id: string;
  venda_entradas?: VendaEntradaRow[] | null;
};

/** Venda concluída de um carro (modo edição do wizard), com as entradas. */
export async function fetchVendaConcluidaByCarro(auth: RequestAuth, carroId: string): Promise<VendaExistente | null> {
  const query = new URLSearchParams({
    carro_id: carroId,
    estado_venda: "concluida",
    page: "1",
    page_size: "1"
  });
  const res = await apiFetch(`/api/v1/vendas?${query.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(auth)
  });
  const rows = await parseEnvelope<VendaExistente[]>(res);
  return rows[0] ?? null;
}
