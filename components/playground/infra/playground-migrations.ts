import type { GridFilters, SheetKey, SortRule } from "@/components/ui-grid/types";
import type {
  PlaygroundCell,
  PlaygroundFeed,
  PlaygroundFeedFragment,
  PlaygroundFeedQuery,
  PlaygroundPage,
  PlaygroundWorkbook
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
    pageSize: readNumber(value.pageSize, DEFAULT_PLAYGROUND_FEED_QUERY.pageSize)
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
  const sourceColumn = readNonEmptyString(raw.sourceColumn);
  const valueLiteral = readNonEmptyString(raw.valueLiteral);
  if (!id || !sourceColumn || !valueLiteral) return null;

  const query = normalizeQuery({
    ...(isRecord(raw.query) ? raw.query : {}),
    pageSize: isRecord(raw.query) ? raw.query.pageSize : fallbackPageSize
  });
  const columns = normalizeStringArray(raw.columns);
  const columnLabels = normalizeStringMap(raw.columnLabels, columns.length > 0 ? columns : undefined);

  return {
    id,
    parentFeedId,
    sourceColumn,
    valueLiteral,
    valueLabel: readNonEmptyString(raw.valueLabel) ?? valueLiteral,
    position: normalizePosition(raw),
    columns: columns.length > 0 ? columns : undefined,
    columnLabels: Object.keys(columnLabels).length > 0 ? columnLabels : undefined,
    query,
    displayColumnOverrides: normalizeStringMap(raw.displayColumnOverrides),
    renderedAt: readNonEmptyString(raw.renderedAt) ?? undefined
  };
}

function normalizeFeed(raw: unknown): PlaygroundFeed | null {
  if (!isRecord(raw)) return null;

  const id = readNonEmptyString(raw.id);
  const table = readNonEmptyString(raw.table);
  if (!id || !table) return null;

  const columns = normalizeStringArray(raw.columns);
  if (columns.length === 0) return null;

  const position = normalizePosition(raw);
  const query = normalizeQuery(raw.query);
  const columnLabels = {
    ...Object.fromEntries(columns.map((column) => [column, column])),
    ...normalizeStringMap(raw.columnLabels, columns)
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
    columns,
    columnLabels,
    query,
    displayColumnOverrides: normalizeStringMap(raw.displayColumnOverrides),
    showPaginationInHeader: raw.showPaginationInHeader === true,
    hideColumnHeader: raw.hideColumnHeader === true,
    fragments,
    anchorFilterColumns,
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
