"use client";

import { parseEnvelope } from "@/lib/api/http-client";
import { fetchAuthed } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ConsultaPlacaTroca, ListaVeiculosVendedor, PainelVeiculo, SituacaoFiltro } from "@/lib/domain/vendedor/types";
import type { VendaEstagio } from "@/lib/domain/vendas/schemas";

/**
 * Cliente das rotas do vendedor: lista de veículos (vitrine, /vender, /word),
 * painel da venda e as transições do ciclo (concluir, entregar, cancelar).
 * Repete UMA vez com token novo quando a sessão expira (fetchAuthed).
 */

export async function fetchVeiculosVendedor(
  auth: RequestAuth,
  params: { situacao: SituacaoFiltro; q?: string; page?: number; pageSize?: number; contagens?: boolean; signal?: AbortSignal }
): Promise<ListaVeiculosVendedor> {
  const query = new URLSearchParams({
    situacao: params.situacao,
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 30)
  });
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.contagens) query.set("contagens", "1");
  const res = await fetchAuthed(`/api/v1/vendedor/veiculos?${query.toString()}`, auth, { cache: "no-store", signal: params.signal });
  return parseEnvelope<ListaVeiculosVendedor>(res);
}

export async function fetchPainelVeiculo(auth: RequestAuth, carroId: string, signal?: AbortSignal): Promise<PainelVeiculo> {
  const res = await fetchAuthed(`/api/v1/vendedor/veiculos/${encodeURIComponent(carroId)}`, auth, { cache: "no-store", signal });
  return parseEnvelope<PainelVeiculo>(res);
}

export async function confirmarIpvaPago(auth: RequestAuth, carroId: string, ano: number): Promise<{ anoIpvaPago: number }> {
  const res = await fetchAuthed(`/api/v1/vendedor/veiculos/${encodeURIComponent(carroId)}/ipva`, auth, {
    method: "POST",
    body: JSON.stringify({ ano })
  });
  return parseEnvelope<{ anoIpvaPago: number }>(res);
}

type VendaPatch = {
  estado_venda?: "aberta" | "concluida";
  estagio?: VendaEstagio;
  data_venda?: string;
  data_entrega?: string | null;
};

async function patchVenda(auth: RequestAuth, vendaId: string, patch: VendaPatch): Promise<void> {
  const res = await fetchAuthed(`/api/v1/vendas/${encodeURIComponent(vendaId)}`, auth, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  await parseEnvelope<unknown>(res);
}

/** Reserva → venda concluída (carro VENDIDO, envelope fechando), aguardando a entrega. */
export function concluirVenda(auth: RequestAuth, vendaId: string, dataVenda: string): Promise<void> {
  return patchVenda(auth, vendaId, { estado_venda: "concluida", estagio: "aberto", data_venda: dataVenda });
}

/** Entrega ao comprador: estágio "fechado" + data (conta os 90 dias da garantia). */
export function registrarEntrega(auth: RequestAuth, vendaId: string, dataEntrega: string): Promise<void> {
  return patchVenda(auth, vendaId, { estagio: "fechado", data_entrega: dataEntrega });
}

/** Desfaz a entrega registrada por engano (volta para "vendido"). */
export function desfazerEntrega(auth: RequestAuth, vendaId: string): Promise<void> {
  return patchVenda(auth, vendaId, { estagio: "aberto", data_entrega: null });
}

/** Cancela reserva ou venda (GERENTE+): o carro volta ao estoque. */
export async function cancelarVenda(auth: RequestAuth, vendaId: string): Promise<void> {
  const res = await fetchAuthed(`/api/v1/vendas/${encodeURIComponent(vendaId)}/cancelar`, auth, { method: "POST" });
  await parseEnvelope<unknown>(res);
}

/** Consulta de placa do carro da troca (modelo, cor, anos, chassi; já cadastrado?). */
export async function consultarPlacaTroca(auth: RequestAuth, placa: string): Promise<ConsultaPlacaTroca> {
  const res = await fetchAuthed(`/api/v1/vendedor/placa?placa=${encodeURIComponent(placa)}`, auth, { cache: "no-store" });
  return parseEnvelope<ConsultaPlacaTroca>(res);
}

export type ModeloOpcao = { id: string; modelo: string };

/** Modelos do catálogo que casam com o texto (autocompletar do carro da troca). */
export async function buscarModelos(auth: RequestAuth, q: string, signal?: AbortSignal): Promise<ModeloOpcao[]> {
  const query = new URLSearchParams({ q, page: "1", page_size: "20" });
  const res = await fetchAuthed(`/api/v1/modelos?${query.toString()}`, auth, { cache: "no-store", signal });
  const rows = await parseEnvelope<Array<{ id: string; modelo: unknown }>>(res);
  return rows.map((row) => ({ id: row.id, modelo: String(row.modelo ?? "") })).filter((row) => row.modelo);
}
