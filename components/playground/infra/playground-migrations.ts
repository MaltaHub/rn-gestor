import type { GridFilters, SheetKey, SortRule } from "@/components/ui-grid/types";
import {
  isProchColumnId,
  type PlaygroundCell,
  type PlaygroundCellStyle,
  type PlaygroundFeed,
  type PlaygroundFeedFragment,
  type PlaygroundFeedQuery,
  type PlaygroundFragmentNameRule,
  type PlaygroundPage,
  type PlaygroundProchColumn,
  type PlaygroundWorkbook
} from "@/components/playground/types";
import {
  createWorkbook,
  PLAYGROUND_MAX_COLS,
  PLAYGROUND_MAX_PAGES,
  PLAYGROUND_MAX_ROWS,
  PLAYGROUND_MIN_COLS,
  PLAYGROUND_MIN_ROWS
} from "@/components/playground/grid-utils";
import { normalizeCellStyle } from "@/components/playground/domain/cell-style";
import { resolveProchValueRelation } from "@/components/playground/domain/feed-data";
import { resolveRelationPath } from "@/components/ui-grid/core/relation-path";
import { filterLeaf, filterRelation, type FilterNode, type FilterRelation } from "@/components/ui-grid/core/filter-predicate";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  normalizeAnchorFilterColumns,
  normalizeFeedQuery
} from "@/components/playground/domain/feed-query";
import { PLAYGROUND_WORKBOOK_VERSION, normalizePlaygroundPreferences } from "@/components/playground/domain/workbook-model";
import { normalizeGridPosition } from "@/components/playground/domain/geometry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNonEmptyString(value: unknown) {
  const text = readString(value).trim();
  return text || null;
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeCount(value: unknown, fallback: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(readNumber(value, fallback))));
}

function normalizeNumberMap(value: unknown, min = 0): Record<string, number> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= min ? [[key, Math.round(parsed)]] : [];
    })
  ) as Record<string, number>;
}

function normalizeHiddenMap(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(Object.entries(value).filter(([, hidden]) => hidden === true)) as Record<string, boolean>;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

function normalizeStringMap(value: unknown, allowedKeys?: string[]) {
  if (!isRecord(value)) return {};
  const allowed = allowedKeys ? new Set(allowedKeys) : null;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      if (allowed && !allowed.has(key)) return [];
      const text = readNonEmptyString(raw);
      return text ? [[key, text]] : [];
    })
  );
}

function normalizeFilters(value: unknown): GridFilters {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      const text = readString(raw).trim();
      return text ? [[key, text]] : [];
    })
  );
}

/** Le um no da arvore de filtros persistida; descarta o que nao tiver forma valida. */
function readFilterNode(value: unknown, depth = 0): FilterNode | null {
  if (!isRecord(value) || depth > 12) return null;

  if (value.kind === "leaf") {
    const column = readNonEmptyString(value.column);
    const expression = readNonEmptyString(value.expression);
    return column && expression ? filterLeaf(column, expression) : null;
  }

  if (value.kind === "relation") {
    const column = readNonEmptyString(value.column);
    const table = readNonEmptyString(value.table);
    const keyColumn = readNonEmptyString(value.keyColumn);
    const where = readFilterNode(value.where, depth + 1);
    if (!column || !table || !keyColumn || !where) return null;
    return filterRelation({ column, table: table as SheetKey, keyColumn, where, negate: value.negate === true });
  }

  if (value.kind === "group" && (value.op === "and" || value.op === "or") && Array.isArray(value.children)) {
    const children = value.children.map((child) => readFilterNode(child, depth + 1)).filter((child): child is FilterNode => child !== null);
    return children.length > 0 ? { kind: "group", op: value.op, children } : null;
  }

  return null;
}

/**
 * Filtros de relacao (aninhados) da query. Antes eram descartados aqui a cada
 * load/save — o filtro aninhado sumia ao recarregar a pagina.
 */
function normalizeRelationFilters(value: unknown): FilterRelation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const node = readFilterNode(raw);
    return node && node.kind === "relation" ? [node] : [];
  });
}

function normalizeSort(value: unknown): SortRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const column = readNonEmptyString(raw.column);
    const dir = raw.dir === "asc" || raw.dir === "desc" ? raw.dir : null;
    return column && dir ? [{ column, dir }] : [];
  });
}

function normalizeQuery(value: unknown): PlaygroundFeedQuery {
  if (!isRecord(value)) return DEFAULT_PLAYGROUND_FEED_QUERY;

  return normalizeFeedQuery({
    query: readString(value.query),
    matchMode: value.matchMode as PlaygroundFeedQuery["matchMode"],
    filters: normalizeFilters(value.filters),
    sort: normalizeSort(value.sort),
    page: readNumber(value.page, DEFAULT_PLAYGROUND_FEED_QUERY.page),
    pageSize: readNumber(value.pageSize, DEFAULT_PLAYGROUND_FEED_QUERY.pageSize),
    relationFilters: normalizeRelationFilters(value.relationFilters)
  });
}

function normalizeCell(value: unknown): PlaygroundCell | null {
  if (!isRecord(value)) return null;
  if (typeof value.feedId === "string" && value.feedId.trim()) return null;

  const cell: PlaygroundCell = {
    value: typeof value.value === "string" ? value.value : value.value == null ? "" : String(value.value)
  };
  const style = normalizeCellStyle(isRecord(value.style) ? value.style : undefined);
  if (style) cell.style = style;

  if (!cell.value && !cell.style) return null;
  return cell;
}

/** Normaliza o mapa de estilos por coluna (formatacao por area dinamica). */
function normalizeColumnStyles(value: unknown): Record<string, PlaygroundCellStyle> {
  if (!isRecord(value)) return {};

  const out: Record<string, PlaygroundCellStyle> = {};
  for (const [column, raw] of Object.entries(value)) {
    if (typeof column !== "string" || !column.trim()) continue;
    const style = normalizeCellStyle(isRecord(raw) ? raw : undefined);
    if (style) out[column] = style;
  }
  return out;
}

function normalizeCells(value: unknown) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      const cell = normalizeCell(raw);
      return cell ? [[key, cell]] : [];
    })
  );
}

function normalizePosition(raw: UnknownRecord) {
  const rawPosition = isRecord(raw.position) ? raw.position : null;
  const row = rawPosition ? rawPosition.row : raw.targetRow;
  const col = rawPosition ? rawPosition.col : raw.targetCol;

  return normalizeGridPosition({
    row: readNumber(row, 0),
    col: readNumber(col, 0)
  });
}

function normalizeFragment(raw: unknown, parentFeedId: string, fallbackPageSize: number): PlaygroundFeedFragment | null {
  if (!isRecord(raw)) return null;

  const id = readNonEmptyString(raw.id);
  const kind = raw.kind === "rows" || raw.kind === "name" ? raw.kind : "value";
  // Fragmento por fatia de linhas nao tem coluna-fonte — antes era descartado
  // aqui e sumia ao recarregar a pagina.
  const sourceColumn = kind === "rows" ? readString(raw.sourceColumn).trim() : readNonEmptyString(raw.sourceColumn);
  const valueLiteral = readNonEmptyString(raw.valueLiteral);
  if (!id || sourceColumn == null || !valueLiteral) return null;

  let nameRule: PlaygroundFragmentNameRule | undefined;
  if (kind === "name") {
    const rawRule = isRecord(raw.nameRule) ? raw.nameRule : null;
    const key = rawRule ? readNonEmptyString(rawRule.key) : null;
    // Sem chave a regra nao cobre nada: o fragmento nao se sustenta.
    if (!key) return null;
    nameRule = { key, path: rawRule ? readString(rawRule.path).trim() : "" };
  }

  const query = normalizeQuery({
    ...(isRecord(raw.query) ? raw.query : {}),
    pageSize: isRecord(raw.query) ? raw.query.pageSize : fallbackPageSize
  });
  const columns = normalizeStringArray(raw.columns);
  const columnLabels = normalizeStringMap(raw.columnLabels, columns.length > 0 ? columns : undefined);

  return {
    id,
    parentFeedId,
    ...(kind === "value" ? {} : { kind }),
    sourceColumn,
    ...(nameRule ? { nameRule } : {}),
    valueLiteral,
    valueLabel: readNonEmptyString(raw.valueLabel) ?? valueLiteral,
    position: normalizePosition(raw),
    columns: columns.length > 0 ? columns : undefined,
    columnLabels: Object.keys(columnLabels).length > 0 ? columnLabels : undefined,
    query,
    displayColumnOverrides: normalizeStringMap(raw.displayColumnOverrides),
    columnStyles: (() => {
      const styles = normalizeColumnStyles(raw.columnStyles);
      return Object.keys(styles).length > 0 ? styles : undefined;
    })(),
    renderedAt: readNonEmptyString(raw.renderedAt) ?? undefined
  };
}

function normalizeProchColumn(raw: unknown): PlaygroundProchColumn | null {
  if (!isRecord(raw)) return null;
  const id = readNonEmptyString(raw.id);
  if (!id || !isProchColumnId(id)) return null;
  const localKeyColumn = readNonEmptyString(raw.localKeyColumn);
  const lookupTable = readNonEmptyString(raw.lookupTable);
  const lookupKeyColumn = readNonEmptyString(raw.lookupKeyColumn);
  const lookupValueColumn = readNonEmptyString(raw.lookupValueColumn);
  if (!localKeyColumn || !lookupTable || !lookupKeyColumn || !lookupValueColumn) return null;

  const column: PlaygroundProchColumn = {
    id,
    label: readNonEmptyString(raw.label) ?? `${lookupTable}.${lookupValueColumn}`,
    localKeyColumn,
    lookupTable: lookupTable as SheetKey,
    lookupKeyColumn,
    lookupValueColumn
  };

  // Expansao do resultado (PROCH que devolve outra FK). E um caminho: so entra
  // se resolver contra o mapa de FKs — config antiga que deixou de valer (a
  // coluna-valor mudou, a FK sumiu) e descartada em vez de virar celula vazia.
  const lookupValueDisplayColumn = readNonEmptyString(raw.lookupValueDisplayColumn);
  if (lookupValueDisplayColumn && resolveRelationPath(resolveProchValueRelation(column), lookupValueDisplayColumn)) {
    column.lookupValueDisplayColumn = lookupValueDisplayColumn;
  }

  return column;
}

function normalizeProchColumns(raw: unknown): PlaygroundProchColumn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeProchColumn)
    .filter((column): column is PlaygroundProchColumn => Boolean(column));
}

function normalizeFeed(raw: unknown): PlaygroundFeed | null {
  if (!isRecord(raw)) return null;

  const id = readNonEmptyString(raw.id);
  const table = readNonEmptyString(raw.table);
  if (!id || !table) return null;

  // `columns` pode incluir ids sinteticos de PROCH; aceitamos qualquer string
  // nao-vazia e validamos depois contra a lista de prochColumns conhecidos.
  const columns = normalizeStringArray(raw.columns);
  if (columns.length === 0) return null;

  const prochColumnsRaw = normalizeProchColumns(raw.prochColumns);
  const validProchIds = new Set(prochColumnsRaw.map((column) => column.id));
  // Limpa columns: descarta ids __proch__ orfaos (sem metadata).
  const cleanedColumns = columns.filter((column) => !isProchColumnId(column) || validProchIds.has(column));
  if (cleanedColumns.length === 0) return null;
  // Descarta prochColumns nao referenciados em `columns` (lixo).
  const referencedProchColumns = prochColumnsRaw.filter((column) => cleanedColumns.includes(column.id));

  const position = normalizePosition(raw);
  const query = normalizeQuery(raw.query);
  const baseLabels = Object.fromEntries(cleanedColumns.map((column) => [column, column])) as Record<string, string>;
  for (const proch of referencedProchColumns) {
    baseLabels[proch.id] = proch.label;
  }
  const columnLabels = {
    ...baseLabels,
    ...normalizeStringMap(raw.columnLabels, cleanedColumns)
  };
  const fragments = Array.isArray(raw.fragments)
    ? raw.fragments
        .map((fragment) => normalizeFragment(fragment, id, query.pageSize))
        .filter((fragment): fragment is PlaygroundFeedFragment => Boolean(fragment))
    : [];

  const anchorFilterColumns = normalizeAnchorFilterColumns(query, normalizeStringArray(raw.anchorFilterColumns));

  return {
    id,
    table: table as SheetKey,
    title: readNonEmptyString(raw.title) ?? undefined,
    position,
    columns: cleanedColumns,
    columnLabels,
    query,
    displayColumnOverrides: normalizeStringMap(raw.displayColumnOverrides),
    columnStyles: (() => {
      const styles = normalizeColumnStyles(raw.columnStyles);
      return Object.keys(styles).length > 0 ? styles : undefined;
    })(),
    showPaginationInHeader: raw.showPaginationInHeader === true,
    hideColumnHeader: raw.hideColumnHeader === true,
    hidden: raw.hidden === true,
    fragments,
    anchorFilterColumns,
    prochColumns: referencedProchColumns,
    targetRow: position.row,
    targetCol: position.col,
    renderedAt: readNonEmptyString(raw.renderedAt) ?? new Date().toISOString()
  };
}

function normalizePage(raw: unknown, index: number, fallback: PlaygroundPage): PlaygroundPage {
  const page = isRecord(raw) ? raw : {};
  const rowCount = normalizeCount(page.rowCount, fallback.rowCount, PLAYGROUND_MIN_ROWS, PLAYGROUND_MAX_ROWS);
  const colCount = normalizeCount(page.colCount, fallback.colCount, PLAYGROUND_MIN_COLS, PLAYGROUND_MAX_COLS);
  const feeds = Array.isArray(page.feeds)
    ? page.feeds.map(normalizeFeed).filter((feed): feed is PlaygroundFeed => Boolean(feed))
    : [];

  return {
    id: readNonEmptyString(page.id) ?? fallback.id,
    name: readNonEmptyString(page.name) ?? `Pagina ${index + 1}`,
    rowCount,
    colCount,
    cells: normalizeCells(page.cells),
    rowHeights: normalizeNumberMap(page.rowHeights, 1),
    columnWidths: normalizeNumberMap(page.columnWidths, 1),
    hiddenRows: normalizeHiddenMap(page.hiddenRows),
    hiddenColumns: normalizeHiddenMap(page.hiddenColumns),
    feeds,
    updatedAt: readNonEmptyString(page.updatedAt) ?? new Date().toISOString()
  };
}

export function migratePlaygroundWorkbook(raw: unknown): PlaygroundWorkbook {
  const fallback = createWorkbook();
  if (!isRecord(raw)) return fallback;

  const rawPages = Array.isArray(raw.pages) ? raw.pages.slice(0, PLAYGROUND_MAX_PAGES) : [];
  const pages = rawPages.map((page, index) => normalizePage(page, index, fallback.pages[0]));
  if (pages.length === 0) return fallback;

  const activePageId = readNonEmptyString(raw.activePageId);

  return {
    version: PLAYGROUND_WORKBOOK_VERSION,
    activePageId: activePageId && pages.some((page) => page.id === activePageId) ? activePageId : pages[0].id,
    pages,
    preferences: normalizePlaygroundPreferences(isRecord(raw.preferences) ? raw.preferences : undefined)
  };
}
