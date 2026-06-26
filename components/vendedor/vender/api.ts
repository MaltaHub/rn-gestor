"use client";

import { apiFetch, ApiClientError, parseEnvelope } from "@/lib/api/http-client";
import { buildRequestHeaders } from "@/components/ui-grid/api";
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

/**
 * RESERVA: cria uma venda 'aberta' minima (carro vira RESERVADO via trigger).
 * forma_pagamento e obrigatoria no banco, entao entra com um placeholder que o
 * vendedor ajusta no wizard. valor_total/comprador ficam nulos ate preencher.
 * Se ja existe reserva ('aberta') pro carro (23505), reaproveita a existente.
 */
export async function reservarVenda(
  auth: RequestAuth,
  carroId: string,
  vendedorAuthUserId: string,
  valorTotal?: number | null
): Promise<VendaCriada> {
  try {
    return await createVendaV2(auth, {
      carro_id: carroId,
      vendedor_auth_user_id: vendedorAuthUserId,
      forma_pagamento: "a_vista_pix",
      estado_venda: "aberta",
      valor_total: valorTotal ?? null
    });
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 409) {
      const existing = await fetchVendaAtivaByCarro(auth, carroId);
      if (existing) return existing as VendaCriada;
    }
    throw err;
  }
}

/**
 * CONCLUIR: promove a reserva 'aberta' -> 'concluida' (carro VENDIDO, envelope
 * fecha), registra a data de entrega e move o estagio para 'fechado' (inicia a
 * contagem dos 90 dias ate 'finalizado').
 */
export async function concluirVenda(auth: RequestAuth, vendaId: string, dataEntrega: string): Promise<VendaCriada> {
  return updateVendaV2(auth, vendaId, {
    estado_venda: "concluida",
    estagio: "fechado",
    data_entrega: dataEntrega
  });
}

/** Venda ATIVA de um carro: a reserva 'aberta' tem prioridade sobre a concluida. */
export async function fetchVendaAtivaByCarro(auth: RequestAuth, carroId: string): Promise<VendaExistente | null> {
  for (const estado of ["aberta", "concluida"] as const) {
    const query = new URLSearchParams({ carro_id: carroId, estado_venda: estado, page: "1", page_size: "1" });
    const res = await apiFetch(`/api/v1/vendas?${query.toString()}`, {
      cache: "no-store",
      headers: buildRequestHeaders(auth)
    });
    const rows = await parseEnvelope<VendaExistente[]>(res);
    if (rows[0]) return rows[0];
  }
  return null;
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

export type VendidoItem = {
  vendaId: string;
  carroId: string;
  estagio: VendaEstagio;
  estadoVenda: string;
  dataEntrega: string | null;
  placa: string | null;
  nome: string | null;
  modelo: string | null;
  cor: string | null;
  anoMod: number | null;
  precoOriginal: number | null;
  coverUrl: string | null;
};

export type VendidosPage = { items: VendidoItem[]; total: number };

type VendaListRow = Record<string, unknown> & {
  id: string;
  carro_id: string;
  estagio?: VendaEstagio | null;
  estado_venda?: string | null;
  data_entrega?: string | null;
  cover_url?: string | null;
  carros?: {
    placa?: string | null;
    nome?: string | null;
    cor?: string | null;
    ano_mod?: number | null;
    preco_original?: number | null;
    modelos?: { modelo?: string | null } | null;
  } | null;
};

/**
 * Vendas em processo (ficha fechada/incompleta): estágio aberto, fechado ou
 * na_garantia — "finalizado" (90 dias após a entrega) fica de fora. Traz a
 * capa do veículo e o total para o contador. Página para scroll infinito.
 */
export async function fetchVendidos(
  auth: RequestAuth,
  params: { q?: string; page?: number; pageSize?: number; estagioIn?: string[]; estadoVenda?: string } = {}
): Promise<VendidosPage> {
  const estagioIn = params.estagioIn && params.estagioIn.length > 0 ? params.estagioIn : ["aberto", "fechado", "na_garantia"];
  const query = new URLSearchParams({
    estado_venda: params.estadoVenda ?? "concluida",
    estagio_in: estagioIn.join(","),
    cover: "1",
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 24)
  });

  const res = await apiFetch(`/api/v1/vendas?${query.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(auth)
  });
  const raw = await res.text();
  let json: { data?: VendaListRow[]; meta?: { total?: number }; error?: { message?: string } };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ApiClientError("Resposta inválida ao listar vendidos.", { status: res.status });
  }
  if (!res.ok || json.error) {
    throw new ApiClientError(json.error?.message ?? "Falha ao listar vendidos.", { status: res.status });
  }
  const needle = params.q?.trim().toLowerCase() ?? "";
  let rows = json.data ?? [];
  if (needle) {
    rows = rows.filter((r) => {
      const placa = (r.carros?.placa ?? "").toLowerCase();
      const nome = (r.carros?.nome ?? "").toLowerCase();
      const modelo = (r.carros?.modelos?.modelo ?? "").toLowerCase();
      return placa.includes(needle) || nome.includes(needle) || modelo.includes(needle);
    });
  }
  const items: VendidoItem[] = rows.map((r) => ({
    vendaId: r.id,
    carroId: r.carro_id,
    estagio: (r.estagio ?? "aberto") as VendaEstagio,
    estadoVenda: r.estado_venda ?? "concluida",
    dataEntrega: r.data_entrega ?? null,
    placa: r.carros?.placa ?? null,
    nome: r.carros?.nome ?? null,
    modelo: r.carros?.modelos?.modelo ?? null,
    cor: r.carros?.cor ?? null,
    anoMod: r.carros?.ano_mod ?? null,
    precoOriginal: r.carros?.preco_original ?? null,
    coverUrl: r.cover_url ?? null
  }));
  return { items, total: json.meta?.total ?? items.length };
}

/** Fecha a venda: registra a entrega (data) e move o estágio para 'fechado'. */
export async function fecharVenda(auth: RequestAuth, vendaId: string, dataEntrega: string): Promise<VendaCriada> {
  return updateVendaV2(auth, vendaId, { estagio: "fechado", data_entrega: dataEntrega });
}

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
