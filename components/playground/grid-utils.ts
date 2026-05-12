import type {
  PlaygroundCell,
  PlaygroundCellStyle,
  PlaygroundFeed,
  PlaygroundPage,
  PlaygroundSelection,
  PlaygroundWorkbook
} from "@/components/playground/types";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  normalizeAnchorFilterColumns,
  normalizeFeedQuery
} from "@/components/playground/domain/feed-query";
import { formatPlaygroundFeedValue } from "@/components/playground/domain/feed-data";
import { DEFAULT_PLAYGROUND_PREFERENCES, PLAYGROUND_WORKBOOK_VERSION } from "@/components/playground/domain/workbook-model";

export const PLAYGROUND_MAX_PAGES = 10;
export const PLAYGROUND_DEFAULT_ROWS = 80;
export const PLAYGROUND_DEFAULT_COLS = 26;
export const PLAYGROUND_MIN_ROWS = 1;
export const PLAYGROUND_MIN_COLS = 1;
export const PLAYGROUND_MAX_ROWS = 300;
export const PLAYGROUND_MAX_COLS = 52;
export const PLAYGROUND_DEFAULT_ROW_HEIGHT = 30;
export const PLAYGROUND_DEFAULT_COLUMN_WIDTH = 112;
export const PLAYGROUND_MIN_ROW_HEIGHT = 24;
export const PLAYGROUND_MAX_ROW_HEIGHT = 180;
export const PLAYGROUND_MIN_COLUMN_WIDTH = 56;
export const PLAYGROUND_MAX_COLUMN_WIDTH = 420;
export const PLAYGROUND_ROW_HEADER_WIDTH = 48;
const PLAYGROUND_AUTOFIT_COLUMN_PADDING = 24;
const PLAYGROUND_AUTOFIT_CHARACTER_WIDTH = 8;
const PLAYGROUND_AUTOFIT_ROW_PADDING = 10;
const PLAYGROUND_AUTOFIT_LINE_HEIGHT = 20;

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

export function columnLabel(index: number) {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const mod = (value - 1) % 26;
    label = String.fromCharCode(65 + mod) + label;
    value = Math.floor((value - mod) / 26);
  }

  return label;
}

export function normalizeSelection(selection: PlaygroundSelection): PlaygroundSelection {
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endRow: Math.max(selection.startRow, selection.endRow),
    endCol: Math.max(selection.startCol, selection.endCol)
  };
}

export function isCellSelected(selection: PlaygroundSelection | null, row: number, col: number) {
  if (!selection) return false;
  const normalized = normalizeSelection(selection);
  return row >= normalized.startRow && row <= normalized.endRow && col >= normalized.startCol && col <= normalized.endCol;
}

export function createPlaygroundPage(index: number): PlaygroundPage {
  const now = new Date().toISOString();
  return {
    id: makeId("page"),
    name: `Pagina ${index}`,
    rowCount: PLAYGROUND_DEFAULT_ROWS,
    colCount: PLAYGROUND_DEFAULT_COLS,
    cells: {},
    rowHeights: {},
    columnWidths: {},
    hiddenRows: {},
    hiddenColumns: {},
    feeds: [],
    updatedAt: now
  };
}

export function createWorkbook(): PlaygroundWorkbook {
  const firstPage = createPlaygroundPage(1);
  return {
    version: PLAYGROUND_WORKBOOK_VERSION,
    activePageId: firstPage.id,
    pages: [firstPage],
    preferences: DEFAULT_PLAYGROUND_PREFERENCES
  };
}

export function getCell(page: PlaygroundPage, row: number, col: number): PlaygroundCell {
  return page.cells[cellKey(row, col)] ?? { value: "" };
}

export function getColumnWidth(page: PlaygroundPage, col: number) {
  return page.columnWidths[String(col)] ?? PLAYGROUND_DEFAULT_COLUMN_WIDTH;
}

export function getRowHeight(page: PlaygroundPage, row: number) {
  return page.rowHeights[String(row)] ?? PLAYGROUND_DEFAULT_ROW_HEIGHT;
}

function clampColumnWidth(width: number) {
  return Math.max(PLAYGROUND_MIN_COLUMN_WIDTH, Math.min(PLAYGROUND_MAX_COLUMN_WIDTH, Math.round(width)));
}

function clampRowHeight(height: number) {
  return Math.max(PLAYGROUND_MIN_ROW_HEIGHT, Math.min(PLAYGROUND_MAX_ROW_HEIGHT, Math.round(height)));
}

function normalizeIndexes(indexes: number[], maxExclusive: number) {
  return Array.from(
    new Set(
      indexes
        .map((index) => Math.round(index))
        .filter((index) => Number.isFinite(index) && index >= 0 && index < maxExclusive)
    )
  ).sort((left, right) => left - right);
}

function estimateCellTextWidth(value: string) {
  const lines = value.split(/\r?\n/);
  const maxLength = Math.max(1, ...lines.map((line) => line.length));
  return clampColumnWidth(maxLength * PLAYGROUND_AUTOFIT_CHARACTER_WIDTH + PLAYGROUND_AUTOFIT_COLUMN_PADDING);
}

function estimateCellTextHeight(value: string) {
  const lineCount = Math.max(1, value.split(/\r?\n/).length);
  return clampRowHeight(lineCount * PLAYGROUND_AUTOFIT_LINE_HEIGHT + PLAYGROUND_AUTOFIT_ROW_PADDING);
}

export function updateCellValue(page: PlaygroundPage, row: number, col: number, value: string): PlaygroundPage {
  const key = cellKey(row, col);
  const previous = page.cells[key] ?? { value: "" };
  const nextCell: PlaygroundCell = { ...previous, value };
  const cells = { ...page.cells, [key]: nextCell };

  if (!nextCell.value && !nextCell.style && !nextCell.feedId) {
    delete cells[key];
  }

  return {
    ...page,
    cells,
    updatedAt: new Date().toISOString()
  };
}

export function paintSelection(page: PlaygroundPage, selection: PlaygroundSelection, style: PlaygroundCellStyle): PlaygroundPage {
  const normalized = normalizeSelection(selection);
  const cells = { ...page.cells };

  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
      const key = cellKey(row, col);
      const previous = cells[key] ?? { value: "" };
      cells[key] = {
        ...previous,
        style: {
          ...previous.style,
          ...style
        }
      };
    }
  }

  return {
    ...page,
    cells,
    updatedAt: new Date().toISOString()
  };
}

export function clearSelectionStyle(page: PlaygroundPage, selection: PlaygroundSelection): PlaygroundPage {
  const normalized = normalizeSelection(selection);
  const cells = { ...page.cells };

  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
      const key = cellKey(row, col);
      const previous = cells[key];
      if (!previous) continue;

      const nextCell: PlaygroundCell = { ...previous };
      delete nextCell.style;

      if (!nextCell.value && !nextCell.feedId) {
        delete cells[key];
        continue;
      }

      cells[key] = nextCell;
    }
  }

  return {
    ...page,
    cells,
    updatedAt: new Date().toISOString()
  };
}

export function clearSelectionValues(page: PlaygroundPage, selection: PlaygroundSelection): PlaygroundPage {
  const normalized = normalizeSelection(selection);
  const cells = { ...page.cells };

  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
      const key = cellKey(row, col);
      const previous = cells[key];
      if (!previous) continue;

      const nextCell: PlaygroundCell = {
        ...previous,
        value: ""
      };

      if (!nextCell.style && !nextCell.feedId) {
        delete cells[key];
        continue;
      }

      cells[key] = nextCell;
    }
  }

  return {
    ...page,
    cells,
    updatedAt: new Date().toISOString()
  };
}

export function resizeColumn(page: PlaygroundPage, col: number, width: number): PlaygroundPage {
  return resizeColumns(page, [col], width);
}

export function resizeColumns(page: PlaygroundPage, cols: number[], width: number): PlaygroundPage {
  const targetCols = normalizeIndexes(cols, page.colCount);
  if (targetCols.length === 0) return page;

  const nextWidth = clampColumnWidth(width);
  const columnWidths = { ...page.columnWidths };
  for (const col of targetCols) {
    columnWidths[String(col)] = nextWidth;
  }

  return {
    ...page,
    columnWidths,
    updatedAt: new Date().toISOString()
  };
}

export function resizeRow(page: PlaygroundPage, row: number, height: number): PlaygroundPage {
  return resizeRows(page, [row], height);
}

export function resizeRows(page: PlaygroundPage, rows: number[], height: number): PlaygroundPage {
  const targetRows = normalizeIndexes(rows, page.rowCount);
  if (targetRows.length === 0) return page;

  const nextHeight = clampRowHeight(height);
  const rowHeights = { ...page.rowHeights };
  for (const row of targetRows) {
    rowHeights[String(row)] = nextHeight;
  }

  return {
    ...page,
    rowHeights,
    updatedAt: new Date().toISOString()
  };
}

export function calculateAutoColumnWidths(page: PlaygroundPage, cols: number[]) {
  const targetCols = normalizeIndexes(cols, page.colCount);
  const widths: Record<string, number> = {};

  for (const col of targetCols) {
    let width = estimateCellTextWidth(columnLabel(col));

    for (let row = 0; row < page.rowCount; row += 1) {
      width = Math.max(width, estimateCellTextWidth(getCell(page, row, col).value));
    }

    widths[String(col)] = width;
  }

  return widths;
}

export function calculateAutoRowHeights(page: PlaygroundPage, rows: number[]) {
  const targetRows = normalizeIndexes(rows, page.rowCount);
  const heights: Record<string, number> = {};

  for (const row of targetRows) {
    let height = estimateCellTextHeight(String(row + 1));

    for (let col = 0; col < page.colCount; col += 1) {
      height = Math.max(height, estimateCellTextHeight(getCell(page, row, col).value));
    }

    heights[String(row)] = height;
  }

  return heights;
}

export function applyColumnWidths(page: PlaygroundPage, widths: Record<string, number>): PlaygroundPage {
  const nextWidths = { ...page.columnWidths };
  let changed = false;

  for (const [colRaw, width] of Object.entries(widths)) {
    const col = Number(colRaw);
    if (!Number.isFinite(col) || col < 0 || col >= page.colCount) continue;

    const nextWidth = clampColumnWidth(width);
    if (nextWidths[String(col)] === nextWidth) continue;

    nextWidths[String(col)] = nextWidth;
    changed = true;
  }

  if (!changed) return page;

  return {
    ...page,
    columnWidths: nextWidths,
    updatedAt: new Date().toISOString()
  };
}

export function applyRowHeights(page: PlaygroundPage, heights: Record<string, number>): PlaygroundPage {
  const nextHeights = { ...page.rowHeights };
  let changed = false;

  for (const [rowRaw, height] of Object.entries(heights)) {
    const row = Number(rowRaw);
    if (!Number.isFinite(row) || row < 0 || row >= page.rowCount) continue;

    const nextHeight = clampRowHeight(height);
    if (nextHeights[String(row)] === nextHeight) continue;

    nextHeights[String(row)] = nextHeight;
    changed = true;
  }

  if (!changed) return page;

  return {
    ...page,
    rowHeights: nextHeights,
    updatedAt: new Date().toISOString()
  };
}

export function ensurePageSize(page: PlaygroundPage, rowCount: number, colCount: number): PlaygroundPage {
  return {
    ...page,
    rowCount: Math.max(page.rowCount, Math.max(PLAYGROUND_MIN_ROWS, Math.min(PLAYGROUND_MAX_ROWS, rowCount))),
    colCount: Math.max(page.colCount, Math.max(PLAYGROUND_MIN_COLS, Math.min(PLAYGROUND_MAX_COLS, colCount))),
    updatedAt: new Date().toISOString()
  };
}

export function trimPageSize(page: PlaygroundPage, rowCount: number, colCount: number): PlaygroundPage {
  const nextRowCount = Math.max(PLAYGROUND_MIN_ROWS, Math.min(PLAYGROUND_MAX_ROWS, rowCount));
  const nextColCount = Math.max(PLAYGROUND_MIN_COLS, Math.min(PLAYGROUND_MAX_COLS, colCount));
  const cells = Object.fromEntries(
    Object.entries(page.cells).filter(([key]) => {
      const [rowRaw, colRaw] = key.split(":");
      const row = Number(rowRaw);
      const col = Number(colRaw);
      return Number.isFinite(row) && Number.isFinite(col) && row >= 0 && row < nextRowCount && col >= 0 && col < nextColCount;
    })
  );
  const rowHeights = Object.fromEntries(
    Object.entries(page.rowHeights).filter(([rowRaw]) => {
      const row = Number(rowRaw);
      return Number.isFinite(row) && row >= 0 && row < nextRowCount;
    })
  );
  const columnWidths = Object.fromEntries(
    Object.entries(page.columnWidths).filter(([colRaw]) => {
      const col = Number(colRaw);
      return Number.isFinite(col) && col >= 0 && col < nextColCount;
    })
  );
  const hiddenRows = Object.fromEntries(
    Object.entries(page.hiddenRows).filter(([rowRaw, hidden]) => {
      const row = Number(rowRaw);
      return hidden && Number.isFinite(row) && row >= 0 && row < nextRowCount;
    })
  );
  const hiddenColumns = Object.fromEntries(
    Object.entries(page.hiddenColumns).filter(([colRaw, hidden]) => {
      const col = Number(colRaw);
      return hidden && Number.isFinite(col) && col >= 0 && col < nextColCount;
    })
  );
  const feeds = page.feeds.filter(
    (feed) =>
      Number.isFinite(feed.targetRow) &&
      Number.isFinite(feed.targetCol) &&
      feed.targetRow >= 0 &&
      feed.targetRow < nextRowCount &&
      feed.targetCol >= 0 &&
      feed.targetCol < nextColCount
  );

  return {
    ...page,
    rowCount: nextRowCount,
    colCount: nextColCount,
    cells,
    rowHeights,
    columnWidths,
    hiddenRows,
    hiddenColumns,
    feeds,
    updatedAt: new Date().toISOString()
  };
}

export function hideRows(page: PlaygroundPage, rows: number[]): PlaygroundPage {
  const hiddenRows = { ...page.hiddenRows };

  rows.forEach((row) => {
    if (row >= 0 && row < page.rowCount) {
      hiddenRows[String(row)] = true;
    }
  });

  return {
    ...page,
    hiddenRows,
    updatedAt: new Date().toISOString()
  };
}

export function hideColumns(page: PlaygroundPage, cols: number[]): PlaygroundPage {
  const hiddenColumns = { ...page.hiddenColumns };

  cols.forEach((col) => {
    if (col >= 0 && col < page.colCount) {
      hiddenColumns[String(col)] = true;
    }
  });

  return {
    ...page,
    hiddenColumns,
    updatedAt: new Date().toISOString()
  };
}

export function showAllRows(page: PlaygroundPage): PlaygroundPage {
  if (Object.keys(page.hiddenRows).length === 0) return page;

  return {
    ...page,
    hiddenRows: {},
    updatedAt: new Date().toISOString()
  };
}

export function showAllColumns(page: PlaygroundPage): PlaygroundPage {
  if (Object.keys(page.hiddenColumns).length === 0) return page;

  return {
    ...page,
    hiddenColumns: {},
    updatedAt: new Date().toISOString()
  };
}

export function isRowHidden(page: PlaygroundPage, row: number) {
  return page.hiddenRows[String(row)] === true;
}

export function isColumnHidden(page: PlaygroundPage, col: number) {
  return page.hiddenColumns[String(col)] === true;
}

function isCellWithinPageBounds(page: PlaygroundPage, row: number, col: number) {
  return row >= 0 && row < page.rowCount && col >= 0 && col < page.colCount;
}

function clearFeedCells(cells: Record<string, PlaygroundCell>, feedId?: string) {
  if (!feedId) return;

  for (const [key, cell] of Object.entries(cells)) {
    if (cell.feedId === feedId) {
      delete cells[key];
    }
  }
}

export function upsertFeedDefinitionInPage(params: {
  page: PlaygroundPage;
  feed: {
    id?: string;
    table: PlaygroundFeed["table"];
    columns: string[];
    columnLabels: Record<string, string>;
    targetRow: number;
    targetCol: number;
    title?: string;
    query?: Partial<PlaygroundFeed["query"]>;
    displayColumnOverrides?: Record<string, string>;
    showPaginationInHeader?: boolean;
    fragments?: PlaygroundFeed["fragments"];
    anchorFilterColumns?: string[];
    renderedAt?: string;
  };
}): { page: PlaygroundPage; feed: PlaygroundFeed } {
  const { feed } = params;
  const query = normalizeFeedQuery(feed.query ?? DEFAULT_PLAYGROUND_FEED_QUERY);
  const renderedAt = feed.renderedAt ?? new Date().toISOString();
  const renderedFeedId = feed.id ?? makeId("feed");
  const cells = { ...params.page.cells };
  clearFeedCells(cells, feed.id);

  const page = ensurePageSize(
    {
      ...params.page,
      cells
    },
    feed.targetRow + query.pageSize + 1,
    feed.targetCol + feed.columns.length
  );

  const renderedFeed: PlaygroundFeed = {
    id: renderedFeedId,
    table: feed.table,
    title: feed.title,
    position: {
      row: feed.targetRow,
      col: feed.targetCol
    },
    columns: feed.columns,
    columnLabels: feed.columnLabels,
    query,
    displayColumnOverrides: feed.displayColumnOverrides ?? {},
    showPaginationInHeader: feed.showPaginationInHeader === true,
    fragments: feed.fragments ?? [],
    anchorFilterColumns: normalizeAnchorFilterColumns(query, feed.anchorFilterColumns),
    targetRow: feed.targetRow,
    targetCol: feed.targetCol,
    renderedAt
  };

  return {
    page: {
      ...page,
      cells,
      feeds: [...page.feeds.filter((item) => item.id !== renderedFeed.id), renderedFeed],
      updatedAt: renderedAt
    },
    feed: renderedFeed
  };
}

export function removeFeedFromPage(page: PlaygroundPage, feedId: string): PlaygroundPage {
  const cells = { ...page.cells };
  clearFeedCells(cells, feedId);

  return {
    ...page,
    cells,
    feeds: page.feeds.filter((feed) => feed.id !== feedId),
    updatedAt: new Date().toISOString()
  };
}

export function renderFeedIntoPage(params: {
  page: PlaygroundPage;
  feed: {
    id?: string;
    table: PlaygroundFeed["table"];
    columns: string[];
    columnLabels: Record<string, string>;
    targetRow: number;
    targetCol: number;
    title?: string;
    query?: Partial<PlaygroundFeed["query"]>;
    displayColumnOverrides?: Record<string, string>;
    showPaginationInHeader?: boolean;
    fragments?: PlaygroundFeed["fragments"];
    anchorFilterColumns?: string[];
  };
  rows: Array<Record<string, unknown>>;
}) {
  const { feed, rows } = params;
  let page = ensurePageSize(
    params.page,
    feed.targetRow + rows.length + 1,
    feed.targetCol + feed.columns.length
  );
  const renderedFeedId = feed.id ?? makeId("feed");
  const query = normalizeFeedQuery(feed.query ?? DEFAULT_PLAYGROUND_FEED_QUERY);
  const cells = { ...page.cells };
  clearFeedCells(cells, feed.id);

  feed.columns.forEach((column, offset) => {
    const rowIndex = feed.targetRow;
    const colIndex = feed.targetCol + offset;
    if (!isCellWithinPageBounds(page, rowIndex, colIndex)) return;

    cells[cellKey(rowIndex, colIndex)] = {
      value: feed.columnLabels[column] ?? column,
      style: {
        background: "#eaf1ff",
        color: "#1d4ed8",
        bold: true
      },
      feedId: renderedFeedId
    };
  });

  rows.forEach((row, rowIndex) => {
    const targetRow = feed.targetRow + rowIndex + 1;
    if (targetRow < 0 || targetRow >= page.rowCount) return;

    feed.columns.forEach((column, colIndex) => {
      const targetCol = feed.targetCol + colIndex;
      if (!isCellWithinPageBounds(page, targetRow, targetCol)) return;

      cells[cellKey(targetRow, targetCol)] = {
        value: formatPlaygroundFeedValue(row[column]),
        feedId: renderedFeedId
      };
    });
  });

  const renderedFeed: PlaygroundFeed = {
    id: renderedFeedId,
    table: feed.table,
    title: feed.title,
    position: {
      row: feed.targetRow,
      col: feed.targetCol
    },
    columns: feed.columns,
    columnLabels: feed.columnLabels,
    query,
    displayColumnOverrides: feed.displayColumnOverrides ?? {},
    showPaginationInHeader: feed.showPaginationInHeader === true,
    fragments: feed.fragments ?? [],
    anchorFilterColumns: normalizeAnchorFilterColumns(query, feed.anchorFilterColumns),
    targetRow: feed.targetRow,
    targetCol: feed.targetCol,
    renderedAt: new Date().toISOString()
  };

  page = {
    ...page,
    cells,
    feeds: [...page.feeds.filter((item) => item.id !== renderedFeed.id), renderedFeed],
    updatedAt: renderedFeed.renderedAt
  };

  return page;
}

export function getUsedRange(page: PlaygroundPage): PlaygroundSelection {
  let maxRow = 0;
  let maxCol = 0;

  for (const key of Object.keys(page.cells)) {
    const [rowRaw, colRaw] = key.split(":");
    const row = Number(rowRaw);
    const col = Number(colRaw);
    if (Number.isFinite(row)) maxRow = Math.max(maxRow, row);
    if (Number.isFinite(col)) maxCol = Math.max(maxCol, col);
  }

  return {
    startRow: 0,
    startCol: 0,
    endRow: Math.max(20, maxRow),
    endCol: Math.max(8, maxCol)
  };
}

export function getActualUsedRange(page: PlaygroundPage): PlaygroundSelection | null {
  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let maxCol = -1;

  for (const [key, cell] of Object.entries(page.cells)) {
    if (!cell.value && !cell.style) continue;

    const [rowRaw, colRaw] = key.split(":");
    const row = Number(rowRaw);
    const col = Number(colRaw);

    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

    minRow = Math.min(minRow, row);
    minCol = Math.min(minCol, col);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }

  if (maxRow < 0 || maxCol < 0) {
    return null;
  }

  return {
    startRow: minRow,
    startCol: minCol,
    endRow: maxRow,
    endCol: maxCol
  };
}
