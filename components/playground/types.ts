import type { GridFilters, SheetKey, SortRule } from "@/components/ui-grid/types";

export type PlaygroundMode = "edit" | "target_select";
export type PlaygroundWorkbookVersion = 2;

export type PlaygroundCellStyle = {
  background?: string;
  color?: string;
  bold?: boolean;
};

export type PlaygroundCell = {
  value: string;
  style?: PlaygroundCellStyle;
  /**
   * Legacy v1 marker. V2 migration removes cells with this marker because
   * live feed rows are rendered from feed payloads, not stored grid cells.
   */
  feedId?: string;
};

export type PlaygroundSelection = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type GridPosition = {
  row: number;
  col: number;
};

export type GridRect = GridPosition & {
  rowSpan: number;
  colSpan: number;
};

export type PlaygroundFeedQuery = {
  query: string;
  matchMode: "contains" | "exact" | "starts" | "ends";
  filters: GridFilters;
  sort: SortRule[];
  page: number;
  pageSize: number;
};

/**
 * Coluna virtual de PROCH (lookup horizontal estilo PROCV).
 * O id e um marcador sintetico (prefixo PROCH_COLUMN_ID_PREFIX) que entra na
 * lista de `columns` do feed, mas nao corresponde a coluna real da tabela
 * fonte: o valor da celula vem de uma busca em outra tabela.
 *
 * Resolucao no render: para cada linha da feed, pega `row[localKeyColumn]` e
 * procura no mapa de lookup construido a partir da `lookupTable` (chave
 * `lookupKeyColumn`, valor `lookupValueColumn`).
 */
export type PlaygroundProchColumn = {
  id: string;
  label: string;
  /** Coluna da tabela fonte do feed cujo valor sera usado como chave. */
  localKeyColumn: string;
  /** Tabela alvo onde a busca acontece. */
  lookupTable: import("@/components/ui-grid/types").SheetKey;
  /** Coluna da tabela alvo que casa com a chave local. */
  lookupKeyColumn: string;
  /** Coluna da tabela alvo cujo valor sera mostrado. */
  lookupValueColumn: string;
};

export const PROCH_COLUMN_ID_PREFIX = "__proch__:";

export function isProchColumnId(id: string): boolean {
  return typeof id === "string" && id.startsWith(PROCH_COLUMN_ID_PREFIX);
}

export type PlaygroundFeedFragment = {
  id: string;
  parentFeedId: string;
  /**
   * "value" (padrao): fragmento por valor de coluna (filtra sourceColumn=valueLiteral).
   * "rows": fragmento por fatia de linhas (paginacao); sourceColumn vazio, sem
   * filtro de coluna nem exclusao no pai — a query carrega page/pageSize.
   */
  kind?: "value" | "rows";
  sourceColumn: string;
  valueLiteral: string;
  valueLabel: string;
  position: GridPosition;
  columns?: string[];
  columnLabels?: Record<string, string>;
  query: PlaygroundFeedQuery;
  displayColumnOverrides: Record<string, string>;
  renderedAt?: string;
};

export type PlaygroundFeed = {
  id: string;
  table: SheetKey;
  title?: string;
  position: GridPosition;
  columns: string[];
  columnLabels: Record<string, string>;
  query: PlaygroundFeedQuery;
  displayColumnOverrides: Record<string, string>;
  showPaginationInHeader: boolean;
  hideColumnHeader: boolean;
  /** Esconde apenas o alimentador pai no grid; fragmentos seguem renderizados. */
  hidden: boolean;
  fragments: PlaygroundFeedFragment[];
  /**
   * Colunas de PROCH definidas para este feed. Os ids destas colunas (com
   * prefixo PROCH_COLUMN_ID_PREFIX) aparecem em `columns` na posicao escolhida
   * pelo usuario; este array carrega a configuracao de cada uma.
   */
  prochColumns: PlaygroundProchColumn[];
  /**
   * Columns whose filter expression is part of the feed definition itself.
   * They cannot be edited via the runtime column popover (they're locked).
   * Filter expressions live in `query.filters[column]`.
   */
  anchorFilterColumns: string[];
  /**
   * Temporary compatibility aliases for the current table-based UI.
   * Future overlay rendering should read/write `position` directly.
   */
  targetRow: number;
  targetCol: number;
  renderedAt: string;
};

export type PlaygroundPage = {
  id: string;
  name: string;
  rowCount: number;
  colCount: number;
  cells: Record<string, PlaygroundCell>;
  rowHeights: Record<string, number>;
  columnWidths: Record<string, number>;
  hiddenRows: Record<string, boolean>;
  hiddenColumns: Record<string, boolean>;
  feeds: PlaygroundFeed[];
  updatedAt: string;
};

export type PlaygroundPreferences = {
  showGridLines: boolean;
  /** Zebra: pinta linhas alternadas em cinza claro (tela e impressao). */
  stripedRows: boolean;
  printMargin: "compact";
  /** Zoom da visualizacao do grid; 1.0 = 100%. Excel-like, nao afeta print. */
  zoom: number;
};

export type PlaygroundWorkbook = {
  version: PlaygroundWorkbookVersion;
  activePageId: string;
  pages: PlaygroundPage[];
  preferences: PlaygroundPreferences;
};

export type PendingFeedConfig = {
  id?: string;
  table: SheetKey;
  title?: string;
  columns: string[];
  columnLabels: Record<string, string>;
  query: PlaygroundFeedQuery;
  showPaginationInHeader: boolean;
  hideColumnHeader: boolean;
  /** Columns whose filter is part of the feed definition (always applied, locked at runtime). */
  anchorFilterColumns: string[];
  prochColumns: PlaygroundProchColumn[];
};
