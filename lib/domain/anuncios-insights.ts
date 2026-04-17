/**
 * lib/domain/anuncios-insights.ts
 *
 * UNICA FONTE DE VERDADE para toda a logica de insights de anuncios.
 *
 * Para adicionar um novo tipo de insight:
 *   1. Adicione o codigo em ANUNCIO_INSIGHT_CODE
 *   2. Adicione a mensagem padrao em ANUNCIO_INSIGHT_MESSAGES
 *   3. Insira em ANUNCIO_INSIGHT_PRIORITY na posicao visual desejada (index 0 = maior prioridade)
 *   4. Mapeie a classe CSS em ANUNCIO_INSIGHT_ROW_CLASS
 *   5. Adicione a extracao de flag em extractInsightFlagsFromRow
 *   6. Adicione a condicao em collectInsightItems
 *
 * Nenhum outro arquivo deve definir mensagens, prioridades ou classes CSS de insight.
 */

export const ANUNCIO_INSIGHT_CODE = {
  /** Veiculo de referencia sem anuncio cadastrado */
  ANUNCIO_SEM_REFERENCIA: "ANUNCIO_SEM_REFERENCIA",
  /** Mais de um veiculo do mesmo grupo repetido esta anunciado no mesmo preco */
  MULTIPLOS_ANUNCIOS_GRUPO: "MULTIPLOS_ANUNCIOS_GRUPO",
  /** Anuncio precisa ser atualizado (preco divergente ou veiculo representativo errado) */
  ATUALIZAR_ANUNCIO: "ATUALIZAR_ANUNCIO",
  /** Veiculo vendido/fora de estoque - anuncio deve ser apagado */
  APAGAR_ANUNCIO_RECOMENDADO: "APAGAR_ANUNCIO_RECOMENDADO",
} as const;

export type AnuncioInsightCode =
  (typeof ANUNCIO_INSIGHT_CODE)[keyof typeof ANUNCIO_INSIGHT_CODE];

/**
 * Ordem de prioridade: index 0 = exibido primeiro / determina a cor da linha do grid.
 * Reordene este array para mudar qual insight "ganha" visualmente.
 */
export const ANUNCIO_INSIGHT_PRIORITY: readonly AnuncioInsightCode[] = [
  ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA,
  ANUNCIO_INSIGHT_CODE.MULTIPLOS_ANUNCIOS_GRUPO,
  ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO,
  ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO,
] as const;

/**
 * Mensagens de fallback - usadas quando o backend nao fornece mensagem especifica.
 * Edite aqui para alterar os textos exibidos no grid e nos paineis de insight.
 */
export const ANUNCIO_INSIGHT_MESSAGES: Record<AnuncioInsightCode, string> = {
  [ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA]:
    "Veiculo de referencia sem anuncio cadastrado.",
  [ANUNCIO_INSIGHT_CODE.MULTIPLOS_ANUNCIOS_GRUPO]:
    "Mais de um veiculo deste grupo esta anunciado (mesmo preco); mantenha apenas o representativo.",
  [ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO]:
    "Atualizar anuncio para o veiculo representativo ou alinhar preco.",
  [ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO]:
    "Recomendado apagar anuncio (veiculo vendido/fora de estoque).",
};

/**
 * Classe CSS aplicada a linha do grid quando este insight e o de maior prioridade.
 * As classes devem estar definidas em globals.css.
 */
export const ANUNCIO_INSIGHT_ROW_CLASS: Record<AnuncioInsightCode, string> = {
  [ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA]: "sheet-row-missing-data",
  [ANUNCIO_INSIGHT_CODE.MULTIPLOS_ANUNCIOS_GRUPO]: "sheet-row-duplicate",
  [ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO]: "sheet-row-warning",
  [ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO]: "sheet-row-delete",
};

export type AnuncioInsightItem = {
  code: AnuncioInsightCode;
  message: string;
};

/**
 * Flags de insight normalizadas - input canonico para toda a logica de insight.
 * Podem ser derivadas de uma linha do grid, de uma resposta de API, etc.
 */
export type AnuncioInsightFlags = {
  hasPendingAction: boolean;
  deleteRecommended: boolean;
  hasGroupDuplicateAds: boolean;
  missingData: boolean;
  /** Codigo bruto do backend (informativo) */
  insightCode: string | null;
  /** Mensagem bruta do backend - sobrepoe o padrao quando nao vazia */
  insightMessage: string | null;
};

/**
 * Coleta todos os insights ativos a partir das flags, deduplicados e ordenados por prioridade.
 *
 * Esta e a funcao canonica - todos os outros helpers derivam dela.
 * Para alterar o comportamento do calculo, edite apenas esta funcao e as constantes acima.
 */
export function collectInsightItems(flags: AnuncioInsightFlags): AnuncioInsightItem[] {
  const raw: AnuncioInsightItem[] = [];

  if (flags.missingData) {
    raw.push({
      code: ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA,
      message: ANUNCIO_INSIGHT_MESSAGES[ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA],
    });
  }

  if (flags.hasGroupDuplicateAds) {
    raw.push({
      code: ANUNCIO_INSIGHT_CODE.MULTIPLOS_ANUNCIOS_GRUPO,
      message: ANUNCIO_INSIGHT_MESSAGES[ANUNCIO_INSIGHT_CODE.MULTIPLOS_ANUNCIOS_GRUPO],
    });
  }

  if (flags.hasPendingAction) {
    const customMessage = flags.insightMessage?.trim();
    raw.push({
      code: ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO,
      message: customMessage || ANUNCIO_INSIGHT_MESSAGES[ANUNCIO_INSIGHT_CODE.ATUALIZAR_ANUNCIO],
    });
  }

  if (flags.deleteRecommended) {
    raw.push({
      code: ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO,
      message: ANUNCIO_INSIGHT_MESSAGES[ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO],
    });
  }

  const seen = new Set<string>();
  const unique = raw.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });

  return unique.sort((a, b) => {
    const ai = ANUNCIO_INSIGHT_PRIORITY.indexOf(a.code);
    const bi = ANUNCIO_INSIGHT_PRIORITY.indexOf(b.code);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Retorna o insight de maior prioridade, ou null se nenhum estiver ativo. */
export function resolvePrimaryInsight(flags: AnuncioInsightFlags): AnuncioInsightItem | null {
  return collectInsightItems(flags)[0] ?? null;
}

/** Retorna a classe CSS de linha do grid para o insight de maior prioridade. */
export function getAnuncioRowClass(flags: AnuncioInsightFlags): string {
  const primary = resolvePrimaryInsight(flags);
  if (!primary) return "";
  return ANUNCIO_INSIGHT_ROW_CLASS[primary.code] ?? "";
}

/** Extrai flags normalizadas de uma linha bruta do grid (usa colunas privadas __ ). */
export function extractInsightFlagsFromRow(row: Record<string, unknown>): AnuncioInsightFlags {
  return {
    hasPendingAction: row.__has_pending_action === true,
    deleteRecommended: row.__delete_recommended === true,
    hasGroupDuplicateAds: row.__has_group_duplicate_ads === true,
    missingData: row.__missing_data === true,
    insightCode: typeof row.__insight_code === "string" ? row.__insight_code : null,
    insightMessage: typeof row.__insight_message === "string" ? row.__insight_message : null,
  };
}

/** Atalho: deriva os items de insight diretamente de uma linha bruta do grid. */
export function buildInsightItemsFromRow(row: Record<string, unknown>): AnuncioInsightItem[] {
  return collectInsightItems(extractInsightFlagsFromRow(row));
}

/** Atalho: retorna a mensagem do insight primario a partir de uma linha, ou null. */
export function getPrimaryInsightMessageFromRow(row: Record<string, unknown>): string | null {
  return resolvePrimaryInsight(extractInsightFlagsFromRow(row))?.message ?? null;
}
