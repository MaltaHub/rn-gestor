/**
 * lib/api/documentos-insights.ts
 *
 * Servico backend para insights de documentos (espelha anuncios-insights.ts).
 * - enrichDocumentoGridRows: junta dados do carro (placa/estado_venda) e marca
 *   __finalizar_documento nas linhas de veiculos vendidos sem envelope FECHADO.
 * - listMissingDocumentoGridRows: linhas virtuais para carros DISPONIVEIS/NOVOS
 *   sem registro em documentos (legado anterior aos triggers; vendidos e
 *   demais estados ficam fora do calculo).
 * - summarizeDocumentoInsights: contagens para o badge da aba (vendidos com
 *   envelope a fechar + linhas faltantes de veiculos disponiveis).
 *
 * Dependencia central: lib/domain/documentos-insights.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import {
  DOCUMENTO_INSIGHT_CODE,
  DOCUMENTO_INSIGHT_MESSAGES,
  isResponsavelViradoPendente,
  needsFinalizarDocumento,
  needsResponsavelVirado,
  resolvePrimaryDocumentoInsight,
} from "@/lib/domain/documentos-insights";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;
type GridRow = Record<string, unknown>;

type CarroLookupRow = {
  id: string;
  placa: string | null;
  estado_venda: string | null;
  estado_veiculo: string | null;
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
    .select("id, placa, estado_venda, estado_veiculo")
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
    const responsavelPendente = needsResponsavelVirado({
      estadoVeiculo: carro?.estado_veiculo ?? null,
      responsavelVirado: typeof row.responsavel_virado === "string" ? row.responsavel_virado : null,
    });
    // O insight dominante (maior peso) define o code/message/cor da linha.
    const primary = resolvePrimaryDocumentoInsight({
      finalizarDocumento: finalizar,
      responsavelPendente,
      missingData: false,
      insightMessage: null,
    });

    return {
      ...row,
      placa: carro?.placa ?? null,
      __finalizar_documento: finalizar,
      __responsavel_pendente: responsavelPendente,
      __missing_data: false,
      __insight_code: primary?.code ?? null,
      __insight_message: primary?.message ?? null,
    };
  });
}

type DocumentoLookupRow = { carro_id: string | null; envelope: string | null; responsavel_virado: string | null };

type DocumentoInsightSources = {
  carros: CarroLookupRow[];
  documentos: DocumentoLookupRow[];
};

/** Carrega carros + documentos uma unica vez para os calculos de insight. */
async function queryInsightSources(supabase: ApiSupabase): Promise<DocumentoInsightSources> {
  const [carrosResult, documentosResult] = await Promise.all([
    supabase.from("carros").select("id, placa, estado_venda, estado_veiculo"),
    supabase.from("documentos").select("carro_id, envelope, responsavel_virado"),
  ]);

  if (carrosResult.error) {
    throw new ApiHttpError(
      500,
      "DOCUMENTO_INSIGHT_MISSING_ROWS_FAILED",
      "Falha ao carregar veiculos para insights de documentos.",
      carrosResult.error
    );
  }
  if (documentosResult.error) {
    throw new ApiHttpError(
      500,
      "DOCUMENTO_INSIGHT_MISSING_ROWS_FAILED",
      "Falha ao carregar documentos para insights.",
      documentosResult.error
    );
  }

  return {
    carros: (carrosResult.data ?? []) as CarroLookupRow[],
    documentos: (documentosResult.data ?? []) as DocumentoLookupRow[],
  };
}

/**
 * Carros DISPONIVEIS/NOVOS sem registro em documentos. So veiculo disponivel
 * conta como pendencia (vendidos/reservados/etc. ficam fora do calculo) — o
 * filtro usa isEstadoVendaDisponivel, a mesma regra do banco
 * (`is_carro_disponivel_ou_novo`), por isso a diferenca e computada aqui e
 * nao via subtracao de counts no SQL.
 */
function missingDocumentoCarros(sources: DocumentoInsightSources): CarroLookupRow[] {
  const documented = new Set(sources.documentos.map((row) => String(row.carro_id)));
  return sources.carros.filter(
    (carro) => isEstadoVendaDisponivel(carro.estado_venda) && !documented.has(String(carro.id))
  );
}

/** Linhas de documentos de veiculos VENDIDOS com envelope ainda nao FECHADO. */
function countFinalizarDocumento(sources: DocumentoInsightSources): number {
  const vendidos = new Set(
    sources.carros.filter((carro) => isVendido(carro.estado_venda)).map((carro) => String(carro.id))
  );
  return sources.documentos.filter(
    (row) =>
      vendidos.has(String(row.carro_id)) &&
      needsFinalizarDocumento({ carroVendido: true, envelope: row.envelope })
  ).length;
}

/** Linhas de documentos cujo carro esta PRONTO mas sem responsavel do virado. */
function countResponsavelPendente(sources: DocumentoInsightSources): number {
  const prontos = new Set(
    sources.carros
      .filter((carro) => String(carro.estado_veiculo ?? "").trim().toUpperCase() === "PRONTO")
      .map((carro) => String(carro.id))
  );
  return sources.documentos.filter(
    (row) => prontos.has(String(row.carro_id)) && isResponsavelViradoPendente(row.responsavel_virado)
  ).length;
}

/**
 * Linhas virtuais para carros disponiveis sem registro em documentos. Os
 * triggers cobrem carros novos; isto pega o legado (mesma mecanica das
 * missing rows de anuncios: a linha aparece no grid e abre o form de criacao).
 */
export async function listMissingDocumentoGridRows(supabase: ApiSupabase): Promise<GridRow[]> {
  return missingDocumentoCarros(await queryInsightSources(supabase)).map((carro) => ({
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
      __responsavel_pendente: false,
      __missing_data: true,
      __insight_code: DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA,
      __insight_message: DOCUMENTO_INSIGHT_MESSAGES[DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA],
    }));
}

export type DocumentoInsightSummary = {
  /**
   * Vendidos com envelope ainda nao FECHADO (= o insight FINALIZAR_DOCUMENTO).
   * Substitui o antigo fechandoCount: como o trigger forca VENDIDO -> envelope
   * FECHANDO, contar "FECHANDO" e "a finalizar" separados duplicava o mesmo
   * conjunto de veiculos.
   */
  finalizarCount: number;
  /** Carros DISPONIVEIS/NOVOS sem linha em documentos */
  missingCount: number;
  /** Carros PRONTO sem responsavel do virado (vazio ou 'Nao chegou') */
  responsavelPendenteCount: number;
};

/** Contagens para o badge da aba documentos. */
export async function summarizeDocumentoInsights(
  supabase: ApiSupabase
): Promise<DocumentoInsightSummary> {
  const sources = await queryInsightSources(supabase);
  return {
    finalizarCount: countFinalizarDocumento(sources),
    missingCount: missingDocumentoCarros(sources).length,
    responsavelPendenteCount: countResponsavelPendente(sources),
  };
}
