/**
 * Insight de VENDAS: veículo VENDIDO sem data de venda — a finalização (90
 * dias) conta dessa data, então ele nunca seria finalizado. Pedido do Kaic
 * (2026-11-09): era inconsistência de Arquivos; é de Vendas (pontinho amarelo).
 *
 * - Carro com venda ativa: a linha da venda ganha __venda_sem_data.
 * - Carro sem venda: linha VIRTUAL no grid de vendas (__missing_data), que
 *   abre o form de criação já com o veículo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;
type GridRow = Record<string, unknown>;

export const VENDA_SEM_DATA_CODE = "VENDA_SEM_DATA";
export const VENDA_SEM_DATA_MESSAGE = "Vendido sem data de venda: registre a venda com a data (a finalização em 90 dias conta dela).";

type SemDataSources = {
  carros: Array<{ id: string; placa: string | null }>;
  /** carro_id → id da venda ativa (não cancelada). */
  vendaAtivaByCarro: Map<string, string>;
};

async function querySemData(supabase: ApiSupabase): Promise<SemDataSources> {
  const { data: carros, error } = await supabase
    .from("carros")
    .select("id, placa")
    .ilike("estado_venda", "vendido")
    .is("data_venda", null)
    .limit(5000);
  if (error) {
    console.error("[VENDAS_INSIGHTS_FAILED]", { error });
    throw new ApiHttpError(500, "VENDAS_INSIGHTS_FAILED", "Falha ao carregar os insights de vendas.");
  }
  const ids = (carros ?? []).map((carro) => carro.id);
  const vendaAtivaByCarro = new Map<string, string>();
  if (ids.length > 0) {
    const { data: vendas, error: vendasError } = await supabase
      .from("vendas")
      .select("id, carro_id, estado_venda")
      .in("carro_id", ids)
      .limit(5000);
    if (vendasError) {
      console.error("[VENDAS_INSIGHTS_FAILED]", { error: vendasError });
      throw new ApiHttpError(500, "VENDAS_INSIGHTS_FAILED", "Falha ao carregar os insights de vendas.");
    }
    for (const venda of vendas ?? []) {
      if (String(venda.estado_venda ?? "").toLowerCase() === "cancelada" || !venda.carro_id) continue;
      vendaAtivaByCarro.set(venda.carro_id, venda.id);
    }
  }
  return { carros: carros ?? [], vendaAtivaByCarro };
}

/** Linhas virtuais: vendidos sem data e sem venda registrada. */
export async function listMissingVendaGridRows(supabase: ApiSupabase): Promise<GridRow[]> {
  const sources = await querySemData(supabase);
  return sources.carros
    .filter((carro) => !sources.vendaAtivaByCarro.has(carro.id))
    .map((carro) => ({
      id: `missing:${carro.id}`,
      carro_id: carro.id,
      placa: carro.placa,
      data_venda: null,
      __missing_data: true,
      __venda_sem_data: true,
      __insight_code: VENDA_SEM_DATA_CODE,
      __insight_message: VENDA_SEM_DATA_MESSAGE
    }));
}

/** Marca as vendas cujo veículo vendido ainda não tem data de venda. */
export async function enrichVendaGridRows(supabase: ApiSupabase, rows: GridRow[]): Promise<GridRow[]> {
  if (rows.length === 0) return rows;
  const sources = await querySemData(supabase);
  const vendaIds = new Set(sources.vendaAtivaByCarro.values());
  return rows.map((row) =>
    vendaIds.has(String(row.id ?? ""))
      ? { ...row, __venda_sem_data: true, __insight_code: VENDA_SEM_DATA_CODE, __insight_message: VENDA_SEM_DATA_MESSAGE }
      : row
  );
}

/** Contagens para o pontinho da tabela de vendas. */
export async function summarizeVendaInsights(supabase: ApiSupabase) {
  const sources = await querySemData(supabase);
  const comVenda = sources.carros.filter((carro) => sources.vendaAtivaByCarro.has(carro.id)).length;
  return { semDataComVendaCount: comVenda, semVendaCount: sources.carros.length - comVenda };
}
