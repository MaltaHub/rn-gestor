/**
 * lib/api/grid-insights.ts
 *
 * Resumo de insights por tabela e linhas ausentes para o grid.
 * Enriquecimento de anúncios é delegado a lib/api/anuncios-insights.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { enrichAnuncioGridRows } from "@/lib/api/anuncios-insights";
import { ANUNCIO_INSIGHT_CODE } from "@/lib/domain/anuncios-insights";
import type { AppRole } from "@/lib/domain/access";
import { hasRequiredRole } from "@/lib/domain/access";
import type { GridTableName } from "@/lib/domain/grid-policy";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;
type GridRow = Record<string, unknown>;
type MissingReferenceRow = {
  grid_row_id: string;
  carro_id: string;
  preco_carro_atual: number | null;
  insight_code: string | null;
  insight_message: string | null;
  criterio_referencia: string | null;
  grupo_id: string | null;
  origem_repetido: boolean | null;
};

function resolveMissingReferenceEstadoAnuncio(row: MissingReferenceRow) {
  const insightCode = row.insight_code?.trim().toUpperCase() ?? "";
  if (
    insightCode === ANUNCIO_INSIGHT_CODE.AUSENTE_EXTRA ||
    insightCode === ANUNCIO_INSIGHT_CODE.ANUNCIO_PRECO_EXTRA
  ) {
    return "AUSENTE_EXTRA";
  }

  return "AUSENTE";
}

export type GridTableInsightSummary = {
  pendingActionCount: number;
  missingDataCount: number;
  hasPendingAction: boolean;
};

function buildAccessibleSummarySeed(role: AppRole) {
  const accessibleTables = Object.keys(GRID_TABLE_POLICIES).filter(
    (table): table is GridTableName =>
      hasRequiredRole(role, GRID_TABLE_POLICIES[table as GridTableName].minReadRole)
  );

  return Object.fromEntries(
    accessibleTables.map((table) => [
      table,
      {
        pendingActionCount: 0,
        missingDataCount: 0,
        hasPendingAction: false,
      } satisfies GridTableInsightSummary,
    ])
  ) as Partial<Record<GridTableName, GridTableInsightSummary>>;
}

export async function listGridTableInsightSummary(params: {
  role: AppRole;
  supabase: ApiSupabase;
}) {
  const summary = buildAccessibleSummarySeed(params.role);

  const [{ count: pendingCount, error: pendingError }, { count: missingCount, error: missingError }] = await Promise.all([
    params.supabase
      .from("anuncios_operational_insights")
      .select("anuncio_id", { count: "exact", head: true })
      .eq("has_pending_action", true),
    params.supabase.from("anuncios_missing_reference").select("grid_row_id", { count: "exact", head: true }),
  ]);

  if (pendingError) {
    throw new ApiHttpError(
      500,
      "GRID_INSIGHT_SUMMARY_FAILED",
      "Falha ao carregar resumo de pendências da grid.",
      pendingError
    );
  }

  if (missingError) {
    throw new ApiHttpError(
      500,
      "GRID_INSIGHT_SUMMARY_FAILED",
      "Falha ao carregar resumo de referências ausentes.",
      missingError
    );
  }

  const pendingActionCount = pendingCount ?? 0;
  const missingDataCount = missingCount ?? 0;

  summary.anuncios = {
    pendingActionCount,
    missingDataCount,
    hasPendingAction: pendingActionCount > 0 || missingDataCount > 0,
  };

  return summary;
}

/**
 * Enriquece linhas do grid com dados de insight quando aplicável.
 * Atualmente apenas anúncios recebem enriquecimento.
 * Para adicionar suporte a outra tabela, adicione um `if` aqui e implemente
 * o serviço correspondente em lib/api/{tabela}-insights.ts.
 */
export async function enrichGridRowsWithInsights(params: {
  supabase: ApiSupabase;
  table: GridTableName;
  rows: GridRow[];
}) {
  if (params.table !== "anuncios" || params.rows.length === 0) {
    return params.rows;
  }

  return enrichAnuncioGridRows(params.supabase, params.rows);
}

export async function listMissingAnuncioGridRows(supabase: ApiSupabase) {
  const { data, error } = await supabase
    .from("anuncios_missing_reference")
    .select(
      "grid_row_id, carro_id, preco_carro_atual, insight_code, insight_message, criterio_referencia, grupo_id, origem_repetido"
    );

  if (error) {
    throw new ApiHttpError(
      500,
      "GRID_INSIGHT_MISSING_ROWS_FAILED",
      "Falha ao carregar linhas ausentes de anúncios.",
      error
    );
  }

  const rows = (data ?? []) as MissingReferenceRow[];

  return rows.map((row) => ({
    id: row.grid_row_id,
    carro_id: row.carro_id,
    anuncio_legado: false,
    id_anuncio_legado: null,
    estado_anuncio: resolveMissingReferenceEstadoAnuncio(row),
    valor_anuncio: null,
    descricao: row.insight_message,
    created_at: null,
    updated_at: null,
    preco_carro_atual: row.preco_carro_atual,
    // Flags de insight para linhas ausentes
    __has_pending_action: false,
    __missing_data: true,
    __has_group_duplicate_ads: false,
    __replace_recommended: false,
    __replacement_carro_id: null,
    __delete_recommended: false,
    __insight_code: typeof row.insight_code === "string" ? row.insight_code : "ANUNCIO_SEM_REFERENCIA",
    __insight_message: row.insight_message,
    __valor_anuncio_sugerido: row.preco_carro_atual,
    __reference_group_id: row.grupo_id,
    __reference_kind: row.criterio_referencia,
    __reference_from_repeated: row.origem_repetido,
  }));
}
