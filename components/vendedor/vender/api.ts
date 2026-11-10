"use client";

import { parseEnvelope } from "@/lib/api/http-client";
import { fetchAuthed } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type {
  EntradaTipo,
  FormaPagamento,
  TipoTransferencia,
  TrocaCarroNovoInput,
  VendaEstagio
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
  /** Débitos do veículo da troca (o que é + total). */
  debitos?: string | null;
  debitos_valor?: number | null;
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
  debitos?: string | null;
  debitos_valor?: number | null;
  comprador_nome?: string | null;
  comprador_documento?: string | null;
  comprador_rg?: string | null;
  comprador_telefone?: string | null;
  comprador_email?: string | null;
  comprador_endereco?: string | null;
  comprador_cep?: string | null;
  comprador_cidade_estado?: string | null;
  financ_banco?: string | null;
  financ_valor?: number | null;
  financ_parcelas_qtde?: number | null;
  financ_parcela_valor?: number | null;
  cartao_parcelas_qtde?: number | null;
  cartao_parcela_valor?: number | null;
  tipo_transferencia?: TipoTransferencia | null;
  valor_transferencia?: number | null;
  observacao?: string | null;
  estagio?: VendaEstagio;
  estado_venda?: "aberta" | "concluida" | "cancelada" | "obsoleta";
  entradas?: VendaEntradaPayload[];
};

export type VendaSalva = Record<string, unknown> & { id: string; carro_id: string; estado_venda: string };

/** Cria a venda: 'aberta' = reserva (carro RESERVADO); 'concluida' = vendido. */
export async function createVenda(auth: RequestAuth, payload: CreateVendaV2Payload): Promise<VendaSalva> {
  const res = await fetchAuthed("/api/v1/vendas", auth, { method: "POST", body: JSON.stringify(payload) });
  return parseEnvelope<VendaSalva>(res);
}

export async function updateVenda(auth: RequestAuth, vendaId: string, payload: Partial<CreateVendaV2Payload>): Promise<VendaSalva> {
  const res = await fetchAuthed(`/api/v1/vendas/${encodeURIComponent(vendaId)}`, auth, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return parseEnvelope<VendaSalva>(res);
}
