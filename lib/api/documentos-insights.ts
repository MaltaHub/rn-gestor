/**
 * lib/api/documentos-insights.ts
 *
 * Servico backend para insights de documentos (espelha anuncios-insights.ts).
 * - enrichDocumentoGridRows: junta dados do carro (placa/estado_venda) e marca
 *   __finalizar_documento nas linhas de veiculos vendidos sem envelope FECHADO.
 * - listMissingDocumentoGridRows: linhas virtuais para carros sem registro em
 *   documentos (legado anterior aos triggers).
 * - summarizeDocumentoInsights: contagens para o badge da aba (envelopes em
 *   FECHANDO + linhas faltantes).
 *
 * Dependencia central: lib/domain/documentos-insights.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import {
  DOCUMENTO_INSIGHT_CODE,
  DOCUMENTO_INSIGHT_MESSAGES,
  ENVELOPE_FECHANDO,
  needsFinalizarDocumento,
} from "@/lib/domain/documentos-insights";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;
type GridRow = Record<string, unknown>;

type CarroLookupRow = {
  id: string;
  placa: string | null;
  estado_venda: string | null;
};

function isVendido(estadoVenda: string | null | undefined): boolean {
  return String(estadoVenda ?? "").trim().toUpperCase() === "VENDIDO";
}

async function queryCarros(
  supabase: ApiSupabase,
  carroIds: string[]
): Promise<CarroLookupRow[]> {
  if (carroIds.length === 0) return [];

  const { data, error } = await supabase
    .from("carros")
    .select("id, placa, estado_venda")
    .in("id", carroIds);

  if (error) {
    throw new ApiHttpError(
      500,
      "DOCUMENTO_INSIGHTS_QUERY_FAILED",
      "Falha ao consultar veiculos para insights de documentos.",
      error
    );
  }

  return (data ?? []) as CarroLookupRow[];
}

/**
 * Enriquece as linhas do grid de documentos:
 *   placa (coluna virtual visivel — identifica o veiculo no grid e no form),
 *   __finalizar_documento, __missing_data, __insight_code, __insight_message.
 */
export async function enrichDocumentoGridRows(
  supabase: ApiSupabase,
  rows: GridRow[]
): Promise<GridRow[]> {
  if (rows.length === 0) return rows;

  const carroIds = rows.map((row) => String(row.carro_id ?? "").trim()).filter(Boolean);
  if (carroIds.length === 0) return rows;

  const carros = await queryCarros(supabase, carroIds);
  const byId = new Map(carros.map((carro) => [String(carro.id), carro]));

  return rows.map((row) => {
    const carro = byId.get(String(row.carro_id ?? ""));
    const finalizar = needsFinalizarDocumento({
      carroVendido: isVendido(carro?.estado_venda),
      envelope: typeof row.envelope === "string" ? row.envelope : null,
    });

    return {
      ...row,
      placa: carro?.placa ?? null,
      __finalizar_documento: finalizar,
      __missing_data: false,
      __insight_code: finalizar ? DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO : null,
      __insight_message: finalizar
        ? DOCUMENTO_INSIGHT_MESSAGES[DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO]
        : null,
    };
  });
}

/**
 * Linhas virtuais para carros sem registro em documentos. Os triggers cobrem
 * carros novos; isto pega o legado (mesma mecanica das missing rows de
 * anuncios: a linha aparece no grid e o clique abre o form de criacao).
 */
export async function listMissingDocumentoGridRows(supabase: ApiSupabase): Promise<GridRow[]> {
  const [carrosResult, documentosResult] = await Promise.all([
    supabase.from("carros").select("id, placa, estado_venda"),
    supabase.from("documentos").select("carro_id"),
  ]);

  if (carrosResult.error) {
    throw new ApiHttpError(
      500,
      "DOCUMENTO_INSIGHT_MISSING_ROWS_FAILED",
      "Falha ao carregar veiculos para linhas ausentes de documentos.",
      carrosResult.error
    );
  }
  if (documentosResult.error) {
    throw new ApiHttpError(
      500,
      "DOCUMENTO_INSIGHT_MISSING_ROWS_FAILED",
      "Falha ao carregar documentos para linhas ausentes.",
      documentosResult.error
    );
  }

  const documented = new Set(
    (documentosResult.data ?? []).map((row) => String(row.carro_id))
  );

  return ((carrosResult.data ?? []) as CarroLookupRow[])
    .filter((carro) => !documented.has(String(carro.id)))
    .map((carro) => ({
      carro_id: carro.id,
      placa: carro.placa,
      origem: null,
      valor_compra: null,
      tipo_de_processo: null,
      proposito: null,
      remetente_id: null,
      pericia: null,
      envelope: null,
      recibo_compra: null,
      chave_reserva: null,
      estado_transferencia: null,
      responsavel_virado: null,
      observacao: null,
      nota_entrada: null,
      nota_saida: null,
      created_at: null,
      updated_at: null,
      __finalizar_documento: false,
      __missing_data: true,
      __insight_code: DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA,
      __insight_message: DOCUMENTO_INSIGHT_MESSAGES[DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA],
    }));
}

export type DocumentoInsightSummary = {
  /** Envelopes em FECHANDO (veiculos vendidos aguardando fechamento) */
  fechandoCount: number;
  /** Carros sem linha em documentos */
  missingCount: number;
};

/** Contagens para o badge da aba documentos. */
export async function summarizeDocumentoInsights(
  supabase: ApiSupabase
): Promise<DocumentoInsightSummary> {
  const [fechandoResult, carrosResult, documentosResult] = await Promise.all([
    supabase
      .from("documentos")
      .select("carro_id", { count: "exact", head: true })
      .eq("envelope", ENVELOPE_FECHANDO),
    supabase.from("carros").select("id", { count: "exact", head: true }),
    supabase.from("documentos").select("carro_id", { count: "exact", head: true }),
  ]);

  const firstError = fechandoResult.error ?? carrosResult.error ?? documentosResult.error;
  if (firstError) {
    throw new ApiHttpError(
      500,
      "DOCUMENTO_INSIGHT_SUMMARY_FAILED",
      "Falha ao carregar resumo de insights de documentos.",
      firstError
    );
  }

  // FK documentos.carro_id -> carros garante documentos <= carros.
  const missingCount = Math.max(0, (carrosResult.count ?? 0) - (documentosResult.count ?? 0));

  return {
    fechandoCount: fechandoResult.count ?? 0,
    missingCount,
  };
}
