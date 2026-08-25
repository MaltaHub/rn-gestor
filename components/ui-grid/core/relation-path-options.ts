import type { SheetKey } from "@/components/ui-grid/types";
import { getRelationFor, type RelationRef } from "@/components/ui-grid/core/relations";
import {
  MAX_RELATION_PATH_DEPTH,
  RELATION_PATH_SEPARATOR,
  formatRelationPath,
  getRelationPathTargetTable
} from "@/components/ui-grid/core/relation-path";

/**
 * Opcoes do seletor de expansao, um nivel por vez.
 *
 * Mesma mecanica nos tres lugares que expandem FK (colunas do grid, colunas do
 * alimentador/fragmento e resultado de PROCH): o usuario ve as colunas da tabela
 * ATUAL e, para cada coluna que e ela mesma uma FK, ganha tambem a opcao de
 * ENTRAR nela. Entrar empilha um salto e o seletor recarrega no nivel seguinte —
 * e assim ate onde ele quiser, sem limite fixo de construcao.
 */

/** Prefixo de chave que significa "entrar nesta FK" em vez de "usar como valor". */
export const RELATION_PATH_ENTER_PREFIX = "__enter__:";
/** Chave da opcao que volta um nivel. */
export const RELATION_PATH_BACK_KEY = "__back__";

export type RelationPathOption = {
  key: string;
  label: string;
  description?: string;
  testId?: string;
};

export type RelationPathOptionsInput = {
  /** FK da coluna sendo expandida (o primeiro salto, ja implicito). */
  baseRelation: RelationRef;
  /** Saltos ja escolhidos (colunas FK atravessadas). */
  segments: string[];
  /** Colunas da tabela do nivel atual. */
  columns: string[];
  /** Prefixo de data-testid, para os testes e2e. */
  testIdPrefix?: string;
};

/** Tabela do nivel atual (onde as `columns` vivem). */
export function getRelationPathCurrentTable(
  baseRelation: RelationRef,
  segments: string[]
): SheetKey | null {
  return getRelationPathTargetTable(baseRelation, segments);
}

/** True quando ainda da pra aprofundar (respeita o teto do caminho). */
export function canDeepenRelationPath(segments: string[]): boolean {
  // +1 pela coluna de exibicao que ainda vai ser escolhida no fim.
  return segments.length + 1 < MAX_RELATION_PATH_DEPTH;
}

/** Caminho final quando o usuario escolhe `column` como valor exibido. */
export function buildRelationPathSelection(segments: string[], column: string): string {
  return formatRelationPath([...segments, column]);
}

/** Rotulo do caminho parcial mostrado no subtitulo do dialogo. */
export function describeRelationPathProgress(
  baseRelation: RelationRef,
  segments: string[]
): string {
  const currentTable = getRelationPathCurrentTable(baseRelation, segments) ?? baseRelation.table;
  if (segments.length === 0) return currentTable;
  return `${baseRelation.table} ${RELATION_PATH_SEPARATOR} ${segments.join(` ${RELATION_PATH_SEPARATOR} `)} → ${currentTable}`;
}

export function buildRelationPathOptions(input: RelationPathOptionsInput): RelationPathOption[] {
  const currentTable = getRelationPathCurrentTable(input.baseRelation, input.segments);
  if (!currentTable) return [];

  const prefix = input.testIdPrefix ?? "relation-path";
  const options: RelationPathOption[] = [];

  if (input.segments.length > 0) {
    options.push({
      key: RELATION_PATH_BACK_KEY,
      label: "⬅ Voltar um nivel",
      description: `Volta para ${input.segments.length === 1 ? input.baseRelation.table : input.segments[input.segments.length - 2]}`,
      testId: `${prefix}-back`
    });
  }

  const deepenAllowed = canDeepenRelationPath(input.segments);

  for (const column of input.columns) {
    options.push({
      key: column,
      label: column,
      description: `Mostra ${currentTable}.${column}`,
      testId: `${prefix}-use-${column}`
    });

    const relation = getRelationFor(currentTable, column);
    if (!relation || !deepenAllowed) continue;

    options.push({
      key: `${RELATION_PATH_ENTER_PREFIX}${column}`,
      label: `↳ entrar em ${relation.table} (via ${column})`,
      description: `${column} tambem e FK — entre para escolher a coluna de ${relation.table}`,
      testId: `${prefix}-enter-${column}`
    });
  }

  return options;
}

/** Le a coluna de uma chave "entrar", ou null se nao for uma. */
export function readRelationPathEnterColumn(optionKey: string): string | null {
  return optionKey.startsWith(RELATION_PATH_ENTER_PREFIX)
    ? optionKey.slice(RELATION_PATH_ENTER_PREFIX.length)
    : null;
}
