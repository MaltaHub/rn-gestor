/**
 * lib/api/anuncios-insights.ts
 *
 * Serviço backend para insights de anúncios.
 * Toda rota de API e enriquecimento de grid passa por este módulo.
 *
 * Dependência central: lib/domain/anuncios-insights.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import {
  collectInsightItems,
  type AnuncioInsightFlags,
  type AnuncioInsightItem,
} from "@/lib/domain/anuncios-insights";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;
type GridRow = Record<string, unknown>;

type OpInsightRow = {
  anuncio_id: string;
  carro_id: string | null;
  preco_carro_atual: number | null;
  has_pending_action: boolean;
  delete_recommended: boolean;
  has_group_duplicate_ads?: boolean;
  replace_recommended?: boolean;
  replacement_carro_id?: string | null;
  insight_code: string | null;
  insight_message: string | null;
};

const INSIGHT_SELECT_FULL =
  "anuncio_id, carro_id, preco_carro_atual, has_pending_action, delete_recommended, insight_code, insight_message, has_group_duplicate_ads, replace_recommended, replacement_carro_id";

/** Fallback para schemas mais antigos sem a coluna has_group_duplicate_ads */
const INSIGHT_SELECT_COMPAT =
  "anuncio_id, carro_id, preco_carro_atual, has_pending_action, delete_recommended, insight_code, insight_message";

/**
 * Consulta a view anuncios_operational_insights para os IDs informados.
 * Degrada graciosamente para o select sem has_group_duplicate_ads se a coluna não existir.
 */
async function queryInsightRows(
  supabase: ApiSupabase,
  anuncioIds: string[]
): Promise<OpInsightRow[]> {
  if (anuncioIds.length === 0) return [];

  const { data, error } = await supabase
    .from("anuncios_operational_insights")
    .select(INSIGHT_SELECT_FULL)
    .in("anuncio_id", anuncioIds);

  if (!error) return (data ?? []) as unknown as OpInsightRow[];

  // Degradação graciosa: coluna has_group_duplicate_ads pode não existir em schemas antigos
  const { data: dataCompat, error: errorCompat } = await supabase
    .from("anuncios_operational_insights")
    .select(INSIGHT_SELECT_COMPAT)
    .in("anuncio_id", anuncioIds);

  if (errorCompat) {
    throw new ApiHttpError(
      500,
      "ANUNCIO_INSIGHTS_QUERY_FAILED",
      "Falha ao consultar insights operacionais de anúncios.",
      errorCompat
    );
  }

  return (dataCompat ?? []) as OpInsightRow[];
}

/** Converte uma linha da view em AnuncioInsightFlags normalizadas. */
function flagsFromOpRow(row: OpInsightRow | null | undefined): AnuncioInsightFlags {
  return {
    hasPendingAction: row?.has_pending_action ?? false,
    deleteRecommended: row?.delete_recommended ?? false,
    replaceRecommended: row?.replace_recommended ?? false,
    hasGroupDuplicateAds: row?.has_group_duplicate_ads ?? false,
    missingData: false,
    insightCode: row?.insight_code ?? null,
    insightMessage: row?.insight_message ?? null,
  };
}

/**
 * Busca os insight items para um único anúncio.
 * Retorna lista deduplicada e ordenada por prioridade, pronta para resposta de API.
 */
export async function fetchAnuncioInsightItems(
  supabase: ApiSupabase,
  anuncioId: string
): Promise<AnuncioInsightItem[]> {
  const rows = await queryInsightRows(supabase, [anuncioId]);
  const row = rows.find((r) => String(r.anuncio_id) === anuncioId);
  return collectInsightItems(flagsFromOpRow(row));
}

/**
 * Enriquece um array de linhas de grid de anúncios com flags de insight operacional.
 *
 * Adiciona as seguintes colunas privadas (__) em cada linha:
 *   __has_pending_action, __delete_recommended, __replace_recommended,
 *   __replacement_carro_id, __has_group_duplicate_ads,
 *   __missing_data, __insight_code, __insight_message, preco_carro_atual
 */
export async function enrichAnuncioGridRows(
  supabase: ApiSupabase,
  rows: GridRow[]
): Promise<GridRow[]> {
  if (rows.length === 0) return rows;

  const anuncioIds = rows
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (anuncioIds.length === 0) return rows;

  const insightRows = await queryInsightRows(supabase, anuncioIds);

  const byId = new Map(
    insightRows.map((row) => [String(row.anuncio_id), row])
  );

  return rows.map((row) => {
    const insight = byId.get(String(row.id ?? ""));
    const flags = flagsFromOpRow(insight);

    return {
      ...row,
      preco_carro_atual: insight?.preco_carro_atual ?? null,
      __has_pending_action: flags.hasPendingAction,
      __delete_recommended: flags.deleteRecommended,
      __replace_recommended: flags.replaceRecommended,
      __replacement_carro_id: insight?.replacement_carro_id ?? null,
      __has_group_duplicate_ads: flags.hasGroupDuplicateAds,
      __missing_data: false,
      __insight_code: flags.insightCode,
      __insight_message: flags.insightMessage,
    };
  });
}
