/**
 * components/ui-grid/anuncio-insights-display.ts
 *
 * Utilitarios de apresentacao de insights para o frontend.
 * Toda logica de exibicao deriva do dominio - nao duplique constantes aqui.
 *
 * Importado por holistic-sheet.tsx para substituir:
 *   - DEFAULT_INSIGHT_MESSAGES (removido)
 *   - buildAnuncioRowInsightMessage (simplificado)
 *   - fallbackMap (removido - use ANUNCIO_INSIGHT_MESSAGES diretamente)
 */

import {
  ANUNCIO_INSIGHT_MESSAGES,
  buildInsightItemsFromRow,
  collectInsightItems,
  getPrimaryInsightMessageFromRow,
  type AnuncioInsightFlags,
  type AnuncioInsightItem,
} from "@/lib/domain/anuncios-insights";

export {
  ANUNCIO_INSIGHT_MESSAGES,
  buildInsightItemsFromRow,
  collectInsightItems,
  getPrimaryInsightMessageFromRow,
  type AnuncioInsightFlags,
  type AnuncioInsightItem,
};

/**
 * Retorna a mensagem de insight primario de uma linha do grid, ou null.
 *
 * Substitui a funcao buildAnuncioRowInsightMessage no holistic-sheet.tsx.
 * Use getPrimaryInsightMessageFromRow para casos simples, ou
 * buildInsightItemsFromRow quando precisar de todos os insights.
 */
export function getRowInsightMessage(row: Record<string, unknown>): string | null {
  return getPrimaryInsightMessageFromRow(row);
}

/**
 * Normaliza os insight items vindos da API /anuncios/[id]/insights,
 * garantindo que mensagens vazias usem o fallback do dominio.
 *
 * Substitui os blocos `fallbackMap` duplicados no holistic-sheet.tsx.
 */
export function normalizeApiInsightItems(
  rawItems: Array<{ code: string; message?: string | null }>
): AnuncioInsightItem[] {
  const seen = new Set<string>();

  return rawItems
    .map((item) => {
      const code = item.code as AnuncioInsightItem["code"];
      const domainMessage = ANUNCIO_INSIGHT_MESSAGES[code];
      const message = String(item.message ?? "").trim() || domainMessage || item.code;
      return { code, message };
    })
    .filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    });
}

/**
 * Constrói o texto de resumo exibido na barra de status do grid
 * quando um anuncio com pendencia esta selecionado.
 *
 * Substitui o bloco inline de `activeAnuncioInsight` no holistic-sheet.tsx.
 */
export function buildActiveInsightSummary(
  row: Record<string, unknown>,
  options: {
    formatCurrency: (value: number) => string;
    normalizeNum: (value: unknown) => number | null;
  }
): string | null {
  const items = buildInsightItemsFromRow(row);
  if (items.length === 0) return null;

  const parts: string[] = [];

  for (const item of items) {
    // Para ATUALIZAR_ANUNCIO com dados de preco disponiveis, enriquece a mensagem
    if (item.code === "ATUALIZAR_ANUNCIO") {
      const precoAtual = options.normalizeNum(row["preco_carro_atual"]);
      const valorAnuncio = options.normalizeNum(row["valor_anuncio"]);
      const msgLower = item.message.toLowerCase();

      if (
        precoAtual !== null &&
        valorAnuncio !== null &&
        precoAtual !== valorAnuncio &&
        !msgLower.includes("representativo")
      ) {
        parts.push(
          `Atualizar preco para ${options.formatCurrency(precoAtual)}` +
            ` (anuncio: ${options.formatCurrency(valorAnuncio)})`
        );
        continue;
      }
    }

    parts.push(item.message);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}
