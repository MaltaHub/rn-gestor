import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { AppRole } from "@/lib/domain/access";
import { hasRequiredRole } from "@/lib/domain/access";
import type { GridTableName } from "@/lib/domain/grid-policy";
import { GRID_TABLE_POLICIES } from "@/lib/domain/grid-policy";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;
type GridRow = Record<string, unknown>;

export type GridTableInsightSummary = {
  pendingActionCount: number;
  missingDataCount: number;
  hasPendingAction: boolean;
};

function buildAccessibleSummarySeed(role: AppRole) {
  const accessibleTables = Object.keys(GRID_TABLE_POLICIES).filter((table): table is GridTableName =>
    hasRequiredRole(role, GRID_TABLE_POLICIES[table as GridTableName].minReadRole)
  );

  return Object.fromEntries(
    accessibleTables.map((table) => [
      table,
      {
        pendingActionCount: 0,
        missingDataCount: 0,
        hasPendingAction: false
      } satisfies GridTableInsightSummary
    ])
  ) as Partial<Record<GridTableName, GridTableInsightSummary>>;
}

export async function listGridTableInsightSummary(params: {
  role: AppRole;
  supabase: ApiSupabase;
}) {
  const summary = buildAccessibleSummarySeed(params.role);

  const { count, error } = await params.supabase
    .from("anuncios_operational_insights" as never)
    .select("anuncio_id", { count: "exact", head: true })
    .eq("has_pending_action", true);

  if (error) {
    throw new ApiHttpError(500, "GRID_INSIGHT_SUMMARY_FAILED", "Falha ao carregar resumo de pendencias da grid.", error);
  }

  const { count: missingCount, error: missingError } = await params.supabase
    .from("anuncios_missing_reference")
    .select("grid_row_id", { count: "exact", head: true });

  if (missingError) {
    throw new ApiHttpError(
      500,
      "GRID_INSIGHT_SUMMARY_FAILED",
      "Falha ao carregar resumo de faltas da referencia de anuncios.",
      missingError
    );
  }

  const pendingActionCount = count ?? 0;
  const missingDataCount = missingCount ?? 0;
  summary.anuncios = {
    pendingActionCount,
    missingDataCount,
    hasPendingAction: pendingActionCount > 0 || missingDataCount > 0
  };

  return summary;
}

export async function enrichGridRowsWithInsights(params: {
  supabase: ApiSupabase;
  table: GridTableName;
  rows: GridRow[];
}) {
  if (params.table !== "anuncios" || params.rows.length === 0) {
    return params.rows;
  }

  const anuncioIds = params.rows
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (anuncioIds.length === 0) {
    return params.rows;
  }

  type OpInsightRow = {
    anuncio_id: string | number;
    preco_carro_atual: number | null;
    has_pending_action: boolean;
    delete_recommended: boolean;
    insight_code: string | null;
    insight_message: string | null;
  };

  const res = await params.supabase
    .from("anuncios_operational_insights" as never)
    .select("anuncio_id, preco_carro_atual, has_pending_action, delete_recommended, insight_code, insight_message")
    .in("anuncio_id", anuncioIds);

  if (res.error) {
    throw new ApiHttpError(500, "GRID_INSIGHT_ENRICH_FAILED", "Falha ao enriquecer linhas da grid com insights.", res.error);
  }

  const rows = (res.data ?? []) as OpInsightRow[];
  const insightByAnuncioId = new Map(
    rows.map((row) => [
      String(row.anuncio_id),
      {
        preco_carro_atual: row.preco_carro_atual,
        has_pending_action: row.has_pending_action,
        delete_recommended: row.delete_recommended,
        insight_code: row.insight_code,
        insight_message: row.insight_message
      }
    ])
  );

  return params.rows.map((row) => {
    const insight = insightByAnuncioId.get(String(row.id ?? ""));

    return {
      ...row,
      preco_carro_atual: insight?.preco_carro_atual ?? null,
      __has_pending_action: insight?.has_pending_action ?? false,
      __delete_recommended: insight?.delete_recommended ?? false,
      __missing_data: false,
      __insight_code: insight?.insight_code ?? null,
      __insight_message: insight?.insight_message ?? null
    };
  });
}

export async function listMissingAnuncioGridRows(supabase: ApiSupabase) {
  const { data, error } = await supabase
    .from("anuncios_missing_reference")
    .select("grid_row_id, carro_id, preco_carro_atual, insight_message, criterio_referencia, grupo_id, origem_repetido");

  if (error) {
    throw new ApiHttpError(500, "GRID_INSIGHT_MISSING_ROWS_FAILED", "Falha ao carregar linhas faltantes de anuncios.", error);
  }

  return (data ?? []).map((row) => ({
    id: row.grid_row_id,
    carro_id: row.carro_id,
    anuncio_legado: false,
    id_anuncio_legado: null,
    estado_anuncio: null,
    valor_anuncio: null,
    descricao: row.insight_message,
    created_at: null,
    updated_at: null,
    preco_carro_atual: row.preco_carro_atual,
    __has_pending_action: false,
    __missing_data: true,
    __insight_code: "ANUNCIO_FALTANTE",
    __insight_message: row.insight_message,
    __valor_anuncio_sugerido: row.preco_carro_atual,
    __reference_group_id: row.grupo_id,
    __reference_kind: row.criterio_referencia,
    __reference_from_repeated: row.origem_repetido
  }));
}
