"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from "react";
import { ApiClientError, fetchSheetRows } from "@/components/ui-grid/api";
import { SHEETS } from "@/components/ui-grid/config";
import {
  EMPTY_FILTER_LITERAL,
  RELATION_BY_SHEET_COLUMN,
  resolveDisplayValueFromLookup,
  toFilterSelectionLabel
} from "@/components/ui-grid/core/grid-rules";
import { HolisticChooserDialog, type HolisticChooserOption } from "@/components/ui-grid/sheet-chrome";
import type { CurrentActor, GridListPayload, RequestAuth, Role, SheetKey } from "@/components/ui-grid/types";
import { PlaygroundGridCanvas } from "@/components/playground/playground-grid-canvas";
import {
  buildPlaygroundFeedRequestKey,
  formatPlaygroundFeedValue,
  type PlaygroundFeedDataRecord,
  type PlaygroundFeedDataTarget
} from "@/components/playground/domain/feed-data";
import { getFeedTargetGridSize, moveFeedTargetInPage } from "@/components/playground/domain/feed-placement";
import { findNearestAvailableGridPosition } from "@/components/playground/domain/collision";
import {
  applyAreaResizePlan,
  calculateAreaResizePlan,
  type AreaResizeMode,
  type AreaResizePlan,
  type PlaygroundArea
} from "@/components/playground/domain/playground-area";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  buildGroupedFragmentValueLiteral,
  normalizeAnchorFilterColumns,
  normalizeFeedQuery,
  parseFeedFilterSelection,
  toggleFeedSort,
  withFeedFilterSelection
} from "@/components/playground/domain/feed-query";
import {
  createFeedFragments,
  createGroupedFeedFragment,
  getFeedFragmentColumnLabels,
  getFeedFragmentColumns,
  removeFeedFragment,
  upsertFeedFragments
} from "@/components/playground/domain/feed-fragments";
import {
  applyColumnWidths,
  applyRowHeights,
  calculateAutoColumnWidths,
  calculateAutoRowHeights,
  clearSelectionStyle,
  clearSelectionValues,
  columnLabel,
  createPlaygroundPage,
  ensurePageSize,
  getActualUsedRange,
  getCell,
  getColumnWidth,
  getRowHeight,
  hideColumns,
  hideRows,
  isColumnHidden,
  isRowHidden,
  normalizeSelection,
  packIntoPrintSlabs,
  paintSelection,
  PLAYGROUND_MAX_COLS,
  PLAYGROUND_MAX_PAGES,
  PLAYGROUND_MAX_ROWS,
  PLAYGROUND_MIN_COLS,
  PLAYGROUND_MIN_ROWS,
  PLAYGROUND_PRINT_PAGE_HEIGHT_PX,
  PLAYGROUND_PRINT_PAGE_WIDTH_PX,
  removeFeedFromPage,
  resizeColumns,
  resizeRows,
  showAllColumns,
  showAllRows,
  trimPageSize,
  upsertFeedDefinitionInPage,
  updateCellValue
} from "@/components/playground/grid-utils";
import { usePlaygroundFeedColumnLoader } from "@/components/playground/hooks/use-playground-feed-column-loader";
import { usePlaygroundFeedFormState } from "@/components/playground/hooks/use-playground-feed-form-state";
import { usePlaygroundFeedData } from "@/components/playground/hooks/use-playground-feed-data";
import {
  usePlaygroundPrintDialog,
  type PlaygroundPrintScope
} from "@/components/playground/hooks/use-playground-print-dialog";
import { usePlaygroundStoredState } from "@/components/playground/hooks/use-playground-stored-state";
import { fetchPlaygroundColumnFacets, type PlaygroundFacetOption } from "@/components/playground/infra/playground-api";
import type {
  PendingFeedConfig,
  PlaygroundFeed,
  PlaygroundFeedQuery,
  PlaygroundMode,
  PlaygroundPage,
  PlaygroundSelection
} from "@/components/playground/types";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { hasRequiredRole } from "@/lib/domain/access";

type PlaygroundWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type ResizeIntent =
  | {
      kind: "column";
      index: number;
      indexes: number[];
      startPointer: number;
      startSize: number;
    }
  | {
      kind: "row";
      index: number;
      indexes: number[];
      startPointer: number;
      startSize: number;
    };

type CellCoords = {
  row: number;
  col: number;
};

type FeedFilterPopoverState = {
  targetId: string;
  column: string;
  label: string;
  top: number;
  left: number;
  maxHeight: number;
};

type FeedRelationDialogState = {
  targetId: string;
  sourceColumn: string;
  targetTable: SheetKey;
  keyColumn: string;
};

type FragmentDialogState = {
  feedId: string;
  sourceColumn: string;
  selectedLiterals: string[];
  search: string;
  options: PlaygroundFacetOption[];
  loading: boolean;
  /** When true, every selected literal is gathered in a SINGLE fragment. */
  groupSelected: boolean;
  /** Optional custom label for the grouped fragment. */
  groupLabel: string;
};

type PendingAreaResize = {
  targetId: string;
  label: string;
  previousRows: number;
  nextRows: number;
  plans: Record<AreaResizeMode, AreaResizePlan>;
};

function buildCellSelection(cell: CellCoords): PlaygroundSelection {
  return {
    startRow: cell.row,
    startCol: cell.col,
    endRow: cell.row,
    endCol: cell.col
  };
}

function formatCellAddress(row: number, col: number) {
  return `${columnLabel(col)}${row + 1}`;
}

function formatSelectionAddress(selection: PlaygroundSelection | null) {
  if (!selection) return "Nenhuma selecao";

  const normalized = normalizeSelection(selection);
  const start = formatCellAddress(normalized.startRow, normalized.startCol);
  const end = formatCellAddress(normalized.endRow, normalized.endCol);

  return start === end ? start : `${start}:${end}`;
}

function toTestIdFragment(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "valor";
}

function createFragmentId(feedId: string, sourceColumn: string, literal: string, index: number, usedIds: Set<string>) {
  const base = `fragment-${toTestIdFragment(feedId)}-${toTestIdFragment(sourceColumn)}-${toTestIdFragment(literal)}`;
  let candidate = base;
  let suffix = index + 1;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function buildLocalFeedFilterOptions(
  rows: Array<Record<string, unknown>>,
  column: string,
  relationDisplayLookup: Record<string, Record<string, unknown>> = {}
): PlaygroundFacetOption[] {
  const bucket = new Map<string, { label: string; count: number }>();
  const hasFkExpansion = column in relationDisplayLookup;

  for (const row of rows) {
    const rawValue = row[column];
    const literal = rawValue == null || rawValue === "" ? EMPTY_FILTER_LITERAL : String(rawValue);
    let label: string;
    if (literal === EMPTY_FILTER_LITERAL) {
      label = "(vazio)";
    } else if (hasFkExpansion) {
      label = formatPlaygroundFeedValue(resolveDisplayValueFromLookup(row, column, relationDisplayLookup));
    } else {
      label = formatPlaygroundFeedValue(rawValue);
    }
    const current = bucket.get(literal);

    if (current) {
      current.count += 1;
      continue;
    }

    bucket.set(literal, { label, count: 1 });
  }

  return Array.from(bucket.entries())
    .map(([literal, meta]) => ({
      literal,
      label: meta.label,
      count: meta.count
    }))
    .sort((left, right) => {
      if (left.literal === EMPTY_FILTER_LITERAL) return -1;
      if (right.literal === EMPTY_FILTER_LITERAL) return 1;
      return left.label.localeCompare(right.label, "pt-BR", { numeric: true, sensitivity: "base" });
    });
}

function applyRelationDisplayToFacetOptions(
  options: PlaygroundFacetOption[],
  column: string,
  relationDisplayLookup: Record<string, Record<string, unknown>>
): PlaygroundFacetOption[] {
  const mapForColumn = relationDisplayLookup[column];
  if (!mapForColumn) return options;

  return options.map((option) => {
    if (option.literal === EMPTY_FILTER_LITERAL) return option;
    if (!(option.literal in mapForColumn)) return option;
    const display = mapForColumn[option.literal];
    if (display == null) return option;
    return { ...option, label: formatPlaygroundFeedValue(display) };
  });
}

function describeFeedFilterExpression(expressionRaw: string) {
  const expression = expressionRaw.trim();
  if (!expression) return "Filtro vazio.";
  if (expression.toUpperCase() === EMPTY_FILTER_LITERAL) return "Somente valores vazios.";
  if (expression.toUpperCase() === "!VAZIO") return "Somente valores preenchidos.";
  if (expression.toUpperCase().startsWith("EXCETO ")) {
    return `Exceto ${expression.slice("EXCETO ".length).split("|").join(", ")}.`;
  }
  if (expression.startsWith("=")) return `Igual a ${toFilterSelectionLabel(expression.slice(1))}.`;
  return expression.split("|").map(toFilterSelectionLabel).join(", ");
}

function getUserFilterEntries(target: Pick<PlaygroundFeedDataTarget, "query" | "lockedFilterColumns">) {
  const locked = new Set(target.lockedFilterColumns);
  return Object.entries(target.query.filters).filter(([column, expression]) => !locked.has(column) && expression.trim().length > 0);
}

function getTargetRenderedRowSpan(targetId: string, records: Record<string, PlaygroundFeedDataRecord>) {
  const record = records[targetId];
  if (record?.status === "ready" || record?.rows.length) {
    return Math.max(1, record.rows.length + 1);
  }

  return null;
}

function buildPlaygroundAreasFromTargets(
  targets: PlaygroundFeedDataTarget[],
  records: Record<string, PlaygroundFeedDataRecord>,
  rowOverrides: Record<string, number> = {}
): PlaygroundArea[] {
  return targets.map((target) => ({
    id: target.id,
    kind: target.kind,
    ownerId: target.feedId,
    origin: target.position,
    size: {
      rows: rowOverrides[target.id] ?? getTargetRenderedRowSpan(target.id, records) ?? getFeedTargetGridSize(target).rowSpan,
      cols: Math.max(1, target.columns.length)
    }
  }));
}

function formatFeedSummary(feed: PlaygroundFeed, tableLabel?: string) {
  return `${tableLabel ?? feed.table} - ${feed.columns.length} colunas - ${formatCellAddress(feed.targetRow, feed.targetCol)}`;
}

function formatRenderedAt(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function buildErrorMessage(error: unknown) {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }

  return "Falha ao executar a operacao no playground.";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function moveOrderedValue(values: string[], value: string, direction: "up" | "down") {
  const index = values.indexOf(value);
  if (index === -1) return values;
  if (direction === "up" && index === 0) return values;
  if (direction === "down" && index === values.length - 1) return values;

  const next = [...values];
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

function toggleOrderedValue(values: string[], value: string, enabled: boolean, referenceOrder = values) {
  if (enabled) {
    if (values.includes(value)) return values;
    if (!referenceOrder.includes(value)) return [...values, value];

    const next = values.filter((entry) => referenceOrder.includes(entry));
    const insertIndex = next.findIndex((entry) => referenceOrder.indexOf(entry) > referenceOrder.indexOf(value));
    if (insertIndex === -1) {
      return [...next, value];
    }
    return [...next.slice(0, insertIndex), value, ...next.slice(insertIndex)];
  }

  return values.filter((entry) => entry !== value);
}

function getSelectedRowIndexes(selection: PlaygroundSelection | null, activeCell: CellCoords | null) {
  const range = selection ? normalizeSelection(selection) : activeCell ? buildCellSelection(activeCell) : null;
  if (!range) return [];

  const rows = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    rows.push(row);
  }

  return rows;
}

function getSelectedColumnIndexes(selection: PlaygroundSelection | null, activeCell: CellCoords | null) {
  const range = selection ? normalizeSelection(selection) : activeCell ? buildCellSelection(activeCell) : null;
  if (!range) return [];

  const cols = [];
  for (let col = range.startCol; col <= range.endCol; col += 1) {
    cols.push(col);
  }

  return cols;
}

function clampSelectionToPage(page: PlaygroundPage, selection: PlaygroundSelection) {
  const normalized = normalizeSelection(selection);

  return {
    startRow: Math.max(0, Math.min(page.rowCount - 1, normalized.startRow)),
    startCol: Math.max(0, Math.min(page.colCount - 1, normalized.startCol)),
    endRow: Math.max(0, Math.min(page.rowCount - 1, normalized.endRow)),
    endCol: Math.max(0, Math.min(page.colCount - 1, normalized.endCol))
  };
}

function buildIndexRange(start: number, end: number) {
  const indexes = [];
  for (let index = start; index <= end; index += 1) {
    indexes.push(index);
  }
  return indexes;
}

function getResizeTargetColumns(page: PlaygroundPage, selection: PlaygroundSelection | null, col: number) {
  if (!selection) return [col];

  const normalized = clampSelectionToPage(page, selection);
  if (col < normalized.startCol || col > normalized.endCol) return [col];

  return buildIndexRange(normalized.startCol, normalized.endCol);
}

function getResizeTargetRows(page: PlaygroundPage, selection: PlaygroundSelection | null, row: number) {
  if (!selection) return [row];

  const normalized = clampSelectionToPage(page, selection);
  if (row < normalized.startRow || row > normalized.endRow) return [row];

  return buildIndexRange(normalized.startRow, normalized.endRow);
}

function getClampedPopoverPosition(rect: DOMRect, width = 280, estimatedHeight = 420) {
  const margin = 8;
  const gap = 8;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const availableWidth = Math.max(120, viewportWidth - margin * 2);
  const popoverWidth = Math.min(width, availableWidth);
  const left = Math.max(margin, Math.min(viewportWidth - popoverWidth - margin, rect.left));
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin);
  const spaceAbove = Math.max(0, rect.top - gap - margin);
  const desiredHeight = Math.min(estimatedHeight, Math.max(96, viewportHeight - margin * 2));
  const placeAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(96, Math.min(placeAbove ? spaceAbove : spaceBelow, viewportHeight - margin * 2));
  const maxHeight = Math.min(desiredHeight, availableHeight);
  const preferredTop = placeAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
  const top = Math.max(margin, Math.min(preferredTop, viewportHeight - maxHeight - margin));

  return { top, left, maxHeight };
}

function findNearestVisibleIndex(total: number, isHidden: (index: number) => boolean, preferred: number) {
  if (total <= 0) return null;

  const clamped = Math.max(0, Math.min(total - 1, preferred));
  if (!isHidden(clamped)) return clamped;

  for (let offset = 1; offset < total; offset += 1) {
    const lower = clamped - offset;
    if (lower >= 0 && !isHidden(lower)) return lower;

    const upper = clamped + offset;
    if (upper < total && !isHidden(upper)) return upper;
  }

  return null;
}

function findNearestVisibleCell(page: PlaygroundPage, preferred?: CellCoords | null) {
  const row = findNearestVisibleIndex(page.rowCount, (index) => isRowHidden(page, index), preferred?.row ?? 0);
  const col = findNearestVisibleIndex(page.colCount, (index) => isColumnHidden(page, index), preferred?.col ?? 0);

  if (row == null || col == null) {
    return null;
  }

  return { row, col };
}

function buildPrintDocument(params: {
  page: PlaygroundPage;
  range: PlaygroundSelection;
  title: string;
  showGridLines: boolean;
  showSheetIndexes: boolean;
}) {
  const normalized = normalizeSelection(params.range);
  const columnIndexes: number[] = [];
  const rowIndexes: number[] = [];

  for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
    if (!isColumnHidden(params.page, col)) {
      columnIndexes.push(col);
    }
  }

  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    if (!isRowHidden(params.page, row)) {
      rowIndexes.push(row);
    }
  }

  // Per-cell sizes use the grid's actual widths/heights so that what users see
  // in the canvas (including the page-break markers) matches what the printer
  // renders on paper. Min sizes keep tiny cells legible.
  const INDEX_COLUMN_WIDTH = 56;
  const indexWidth = params.showSheetIndexes ? INDEX_COLUMN_WIDTH : 0;
  const printableWidthForBody = Math.max(120, PLAYGROUND_PRINT_PAGE_WIDTH_PX - indexWidth);

  // Slabs of columns/rows that each fit one A4 page. The print emits one
  // section per (column-slab, row-slab) pair, with `page-break-after: always`
  // separating them, so overflowing content naturally spans multiple sheets.
  const columnSlabs = packIntoPrintSlabs(
    columnIndexes,
    (col) => Math.max(40, getColumnWidth(params.page, col)),
    printableWidthForBody
  );
  const rowSlabs = packIntoPrintSlabs(
    rowIndexes,
    (row) => Math.max(18, getRowHeight(params.page, row)),
    PLAYGROUND_PRINT_PAGE_HEIGHT_PX
  );

  const safeColumnSlabs = columnSlabs.length > 0 ? columnSlabs : [columnIndexes];
  const safeRowSlabs = rowSlabs.length > 0 ? rowSlabs : [rowIndexes];
  const totalPages = safeColumnSlabs.length * safeRowSlabs.length;

  const gridBorder = params.showGridLines ? "1px solid #cbd5e1" : "0";

  const sectionMarkup: string[] = [];
  let pageIndex = 0;

  for (let rowSlabIndex = 0; rowSlabIndex < safeRowSlabs.length; rowSlabIndex += 1) {
    const rowSlab = safeRowSlabs[rowSlabIndex];

    for (let colSlabIndex = 0; colSlabIndex < safeColumnSlabs.length; colSlabIndex += 1) {
      const colSlab = safeColumnSlabs[colSlabIndex];
      pageIndex += 1;
      const isLastPage = pageIndex >= totalPages;

      const colWidths = colSlab.map((col) => Math.max(40, getColumnWidth(params.page, col)));
      const tableWidth = colWidths.reduce((sum, value) => sum + value, 0) + indexWidth;

      const colgroupMarkup = colWidths.map((width) => `<col style="width:${width}px;" />`).join("");
      const indexColgroupMarkup = params.showSheetIndexes ? `<col style="width:${indexWidth}px;" />` : "";

      const headerMarkup = params.showSheetIndexes
        ? `<thead>
            <tr>
              <th></th>
              ${colSlab.map((col) => `<th>${columnLabel(col)}</th>`).join("")}
            </tr>
          </thead>`
        : "";

      const bodyMarkup = rowSlab
        .map((row) => {
          const rowHeight = Math.max(18, getRowHeight(params.page, row));
          const cells = colSlab
            .map((col) => {
              const cell = getCell(params.page, row, col);
              const cellStyle = [
                cell.style?.background ? `background-color:${cell.style.background} !important;` : "",
                cell.style?.color ? `color:${cell.style.color} !important;` : "",
                cell.style?.bold ? "font-weight:700;" : ""
              ].join("");

              return `<td${cellStyle ? ` style="${cellStyle}"` : ""}>${escapeHtml(cell.value || " ")}</td>`;
            })
            .join("");

          return `<tr style="height:${rowHeight}px;page-break-inside:avoid;">${params.showSheetIndexes ? `<th>${row + 1}</th>` : ""}${cells}</tr>`;
        })
        .join("");

      const meta = totalPages > 1
        ? `<p class="print-meta">Folha ${pageIndex} de ${totalPages} - Intervalo: ${escapeHtml(formatSelectionAddress(normalized))}</p>`
        : `<p class="print-meta">Intervalo impresso: ${escapeHtml(formatSelectionAddress(normalized))}</p>`;

      sectionMarkup.push(`
        <section class="print-sheet"${isLastPage ? "" : ' style="page-break-after:always;"'}>
          <h1>${escapeHtml(params.title)}</h1>
          ${meta}
          <table style="width:${tableWidth}px;">
            <colgroup>
              ${indexColgroupMarkup}
              ${colgroupMarkup}
            </colgroup>
            ${headerMarkup}
            <tbody>
              ${bodyMarkup}
            </tbody>
          </table>
        </section>
      `);
    }
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 4mm;
      }

      *,
      *::before,
      *::after {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      html,
      body {
        margin: 0;
        background: #ffffff;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #0f172a;
      }

      body {
        padding: 0;
      }

      .print-sheet {
        padding: 0;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 16px;
      }

      p.print-meta {
        margin: 0 0 10px;
        color: #475569;
        font-size: 11px;
      }

      table {
        border-collapse: collapse;
        table-layout: fixed;
      }

      thead {
        display: table-header-group;
      }

      tr {
        page-break-inside: avoid;
      }

      th,
      td {
        box-sizing: border-box;
        border: ${gridBorder};
        padding: 0 10px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
      }

      thead th,
      tbody th {
        background-color: #e2e8f0 !important;
        color: #334155 !important;
        font-weight: 700;
      }

      tbody th {
        width: ${INDEX_COLUMN_WIDTH}px;
        text-align: right;
      }
    </style>
  </head>
  <body>
    ${sectionMarkup.join("\n")}
  </body>
</html>`;
}

function PlaygroundToolButton(props: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`playground-tool-button ${props.active ? "is-active" : ""} ${props.wide ? "is-wide" : ""}`.trim()}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function PlaygroundWorkspace({ actor, accessToken, devRole, onSignOut }: PlaygroundWorkspaceProps) {
  const requestAuth = useMemo<RequestAuth>(
    () => ({
      accessToken,
      devRole
    }),
    [accessToken, devRole]
  );
  const accessibleSheets = useMemo(
    () => SHEETS.filter((sheet) => hasRequiredRole(actor.role, sheet.minReadRole)),
    [actor.role]
  );

  const selectionAnchorRef = useRef<CellCoords | null>(null);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const feedFacetCacheRef = useRef(new Map<string, PlaygroundFacetOption[]>());

  const [selection, setSelection] = useState<PlaygroundSelection | null>(null);
  const [mode, setMode] = useState<PlaygroundMode>("edit");
  const [pendingFeedConfig, setPendingFeedConfig] = useState<PendingFeedConfig | null>(null);
  const [resizeIntent, setResizeIntent] = useState<ResizeIntent | null>(null);
  const [editingCell, setEditingCell] = useState<CellCoords | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  const [formulaValue, setFormulaValue] = useState("");
  const [fillColor, setFillColor] = useState("#fff3a6");
  const [textColor, setTextColor] = useState("#1f2937");
  const [paintBold, setPaintBold] = useState(false);
  const {
    feedDialogOpen,
    setFeedDialogOpen,
    feedHubSelectedId,
    setFeedHubSelectedId,
    feedHubFragmentId,
    setFeedHubFragmentId,
    feedTitle,
    setFeedTitle,
    feedTable,
    setFeedTable,
    feedColumns,
    setFeedColumns,
    feedColumnLabels,
    setFeedColumnLabels,
    feedPageSize,
    setFeedPageSize,
    feedShowPaginationInHeader,
    setFeedShowPaginationInHeader,
    feedAnchorFilterColumns,
    setFeedAnchorFilterColumns,
    editingFeedId,
    setEditingFeedId
  } = usePlaygroundFeedFormState();
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    activeColumns,
    applyFeedColumnsFromSource,
    loadTableColumns,
    loadingColumnsFor,
    tableColumnsByKey
  } = usePlaygroundFeedColumnLoader({
    feedTable,
    requestAuth,
    setFeedColumns,
    setFeedColumnLabels,
    buildErrorMessage,
    onError: setError
  });
  const [feedFilterPopover, setFeedFilterPopover] = useState<FeedFilterPopoverState | null>(null);
  const [feedFilterSearch, setFeedFilterSearch] = useState("");
  const [feedFilterDraftValues, setFeedFilterDraftValues] = useState<string[]>([]);
  const [feedFilterOptions, setFeedFilterOptions] = useState<PlaygroundFacetOption[]>([]);
  const [feedFilterLoading, setFeedFilterLoading] = useState(false);
  const [activeFeedFiltersTargetId, setActiveFeedFiltersTargetId] = useState<string | null>(null);
  const [relationCache, setRelationCache] = useState<Partial<Record<SheetKey, GridListPayload>>>({});
  const [feedRelationDialog, setFeedRelationDialog] = useState<FeedRelationDialogState | null>(null);
  const [feedRelationDialogLoading, setFeedRelationDialogLoading] = useState(false);
  const [fragmentDialog, setFragmentDialog] = useState<FragmentDialogState | null>(null);
  const [pendingAreaResize, setPendingAreaResize] = useState<PendingAreaResize | null>(null);
  const [areaResizePreviewMode, setAreaResizePreviewMode] = useState<AreaResizeMode>("shift-range");

  const closeFeedFilterPopover = useCallback(() => {
    setFeedFilterPopover(null);
    setFeedFilterSearch("");
    setFeedFilterDraftValues([]);
    setFeedFilterOptions([]);
    setFeedFilterLoading(false);
  }, []);

  const handleWorkbookHydrated = useCallback(
    (initialPage: PlaygroundPage | null) => {
      const initialCell = initialPage ? findNearestVisibleCell(initialPage, { row: 0, col: 0 }) : null;

      feedFacetCacheRef.current.clear();
      setSelection(initialCell ? buildCellSelection(initialCell) : null);
      setActiveCell(initialCell);
      setMode("edit");
      setPendingFeedConfig(null);
      setEditingCell(null);
      setEditingValue("");
      setFormulaValue("");
      setFeedDialogOpen(false);
      setFeedHubSelectedId(null);
      setFeedHubFragmentId(null);
      setFeedTitle("");
      setFeedTable("");
      setFeedColumns([]);
      setFeedColumnLabels({});
      setEditingFeedId(null);
      setFeedAnchorFilterColumns([]);
      closeFeedFilterPopover();
      setActiveFeedFiltersTargetId(null);
      setRelationCache({});
      setFeedRelationDialog(null);
      setFeedRelationDialogLoading(false);
      setFragmentDialog(null);
      setPendingAreaResize(null);
      setAreaResizePreviewMode("shift-range");
      setBusyMessage(null);
      setError(null);
      setInfo(null);
    },
    [closeFeedFilterPopover]
  );

  const {
    workbook,
    setWorkbook,
    activePage,
    updatePageById,
    updateActivePage,
    updateWorkbookPreferences
  } = usePlaygroundStoredState({
    actor,
    onHydrate: handleWorkbookHydrated
  });
  const activeHubFeed = useMemo(() => {
    if (!activePage || !feedHubSelectedId) return null;
    return activePage.feeds.find((feed) => feed.id === feedHubSelectedId) ?? null;
  }, [activePage, feedHubSelectedId]);
  const activeHubFragment = useMemo(() => {
    if (!activeHubFeed || !feedHubFragmentId) return null;
    return activeHubFeed.fragments.find((fragment) => fragment.id === feedHubFragmentId) ?? null;
  }, [activeHubFeed, feedHubFragmentId]);
  const activeHubFragmentColumns = useMemo(
    () => (activeHubFeed && activeHubFragment ? getFeedFragmentColumns(activeHubFeed, activeHubFragment) : []),
    [activeHubFeed, activeHubFragment]
  );
  const activeHubFragmentLabels = useMemo(
    () => (activeHubFeed && activeHubFragment ? getFeedFragmentColumnLabels(activeHubFeed, activeHubFragment) : {}),
    [activeHubFeed, activeHubFragment]
  );
  const {
    displayCells: feedDisplayCells,
    firstError: feedDataError,
    targets: feedDataTargets,
    isRefreshing: feedDataRefreshing,
    recordsByTargetId: feedDataByTargetId,
    relationDisplayLookupByTargetId: feedRelationDisplayLookupByTargetId,
    refreshAll: refreshAllFeedData,
    refreshFeed: refreshFeedData
  } = usePlaygroundFeedData({ page: activePage, requestAuth, relationCache });
  const printablePage = useMemo(() => {
    if (!activePage) return null;

    return {
      ...activePage,
      cells: {
        ...activePage.cells,
        ...feedDisplayCells
      }
    };
  }, [activePage, feedDisplayCells]);

  const currentEditingFeed = useMemo(() => {
    if (!activePage || !editingFeedId) return null;
    return activePage.feeds.find((feed) => feed.id === editingFeedId) ?? null;
  }, [activePage, editingFeedId]);
  const currentEditingFeedFilterEntries = useMemo(() => {
    if (!currentEditingFeed) return [];

    return Object.entries(normalizeFeedQuery(currentEditingFeed.query).filters).filter(([, expression]) => expression.trim().length > 0);
  }, [currentEditingFeed]);
  const feedAnchorFilterColumnSet = useMemo(() => new Set(feedAnchorFilterColumns), [feedAnchorFilterColumns]);
  const activeFeedFilterTarget = useMemo(() => {
    if (!feedFilterPopover) return null;
    return feedDataTargets.find((target) => target.id === feedFilterPopover.targetId) ?? null;
  }, [feedDataTargets, feedFilterPopover]);
  const activeFeedFiltersTarget = useMemo(() => {
    if (!activeFeedFiltersTargetId) return null;
    return feedDataTargets.find((target) => target.id === activeFeedFiltersTargetId) ?? null;
  }, [activeFeedFiltersTargetId, feedDataTargets]);
  const activeFeedFiltersDialogOptions = useMemo<HolisticChooserOption[]>(() => {
    if (!activeFeedFiltersTarget) return [];

    const filters = getUserFilterEntries(activeFeedFiltersTarget);
    return [
      ...(filters.length > 1
        ? [
            {
              key: "__all__",
              label: "Limpar todos",
              description: `Remove os ${filters.length} filtros ativos desta area.`,
              testId: `playground-active-filter-option-all-${activeFeedFiltersTarget.id}`
            }
          ]
        : []),
      ...filters.map(([column, expression]) => ({
        key: column,
        label: activeFeedFiltersTarget.columnLabels[column] ?? column,
        description: describeFeedFilterExpression(expression),
        testId: `playground-active-filter-option-${activeFeedFiltersTarget.id}-${column}`
      }))
    ];
  }, [activeFeedFiltersTarget]);
  const activeFragmentFeed = useMemo(() => {
    if (!activePage || !fragmentDialog) return null;
    return activePage.feeds.find((feed) => feed.id === fragmentDialog.feedId) ?? null;
  }, [activePage, fragmentDialog]);
  const activeFragmentTarget = useMemo(() => {
    if (!fragmentDialog) return null;
    return feedDataTargets.find((target) => target.id === fragmentDialog.feedId && target.kind === "feed") ?? null;
  }, [feedDataTargets, fragmentDialog]);
  const fragmentDialogFeedId = fragmentDialog?.feedId ?? null;
  const fragmentDialogSourceColumn = fragmentDialog?.sourceColumn ?? null;
  const activeFeedFilterRelation =
    activeFeedFilterTarget && feedFilterPopover
      ? RELATION_BY_SHEET_COLUMN[activeFeedFilterTarget.table]?.[feedFilterPopover.column] ?? null
      : null;
  const activeFeedFilterRequestKey = activeFeedFilterTarget ? buildPlaygroundFeedRequestKey(activeFeedFilterTarget) : "";
  const feedRelationDialogPayload = feedRelationDialog ? relationCache[feedRelationDialog.targetTable] ?? null : null;
  const activeFeedFilterOptions = useMemo(() => {
    const search = feedFilterSearch.trim().toLowerCase();
    if (!search) return feedFilterOptions;

    return feedFilterOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(search) ||
        option.literal.toLowerCase().includes(search) ||
      (option.literal === EMPTY_FILTER_LITERAL && "vazio".includes(search))
    );
  }, [feedFilterOptions, feedFilterSearch]);
  const activeFragmentOptions = useMemo(() => {
    if (!fragmentDialog) return [];

    const existingLiterals = new Set(
      activeFragmentFeed?.fragments
        .filter((fragment) => fragment.sourceColumn === fragmentDialog.sourceColumn)
        .map((fragment) => fragment.valueLiteral) ?? []
    );
    const search = fragmentDialog.search.trim().toLowerCase();

    return fragmentDialog.options.filter((option) => {
      if (existingLiterals.has(option.literal)) return false;
      if (!search) return true;

      return (
        option.label.toLowerCase().includes(search) ||
        option.literal.toLowerCase().includes(search) ||
        (option.literal === EMPTY_FILTER_LITERAL && "vazio".includes(search))
      );
    });
  }, [activeFragmentFeed, fragmentDialog]);
  const activeAreaResizePlan = pendingAreaResize?.plans[areaResizePreviewMode] ?? null;

  const feedTableOptions = useMemo(() => {
    const labels = new Map<string, string>();

    accessibleSheets.forEach((sheet) => {
      labels.set(sheet.key, `${sheet.group} - ${sheet.label}`);
    });

    activePage?.feeds.forEach((feed) => {
      if (!labels.has(feed.table)) {
        labels.set(feed.table, feed.table);
      }
    });

    if (feedTable && !labels.has(feedTable)) {
      labels.set(feedTable, feedTable);
    }

    return Array.from(labels.entries()).map(([key, label]) => ({
      key: key as SheetKey,
      label
    }));
  }, [accessibleSheets, activePage, feedTable]);

  const tableLabelByKey = useMemo(
    () =>
      feedTableOptions.reduce<Record<string, string>>((acc, option) => {
        acc[option.key] = option.label;
        return acc;
      }, {}),
    [feedTableOptions]
  );

  const normalizedSelection = selection ? normalizeSelection(selection) : null;
  const pageUsedRange = printablePage ? getActualUsedRange(printablePage) : null;
  const {
    printDialog,
    setPrintDialog,
    printDialogRange,
    printPreviewColumnIndexes,
    printPreviewRowIndexes,
    openPrintDialog,
    submitPrintDialog
  } = usePlaygroundPrintDialog({
    activePage,
    workbook,
    printablePage,
    selection,
    buildPrintDocument,
    onError: setError
  });

  const visibleColumnIndexes = useMemo(() => {
    if (!activePage) return [];
    return Array.from({ length: activePage.colCount }, (_, index) => index).filter((index) => !isColumnHidden(activePage, index));
  }, [activePage]);

  const visibleRowIndexes = useMemo(() => {
    if (!activePage) return [];
    return Array.from({ length: activePage.rowCount }, (_, index) => index).filter((index) => !isRowHidden(activePage, index));
  }, [activePage]);

  const hiddenRowCount = activePage ? activePage.rowCount - visibleRowIndexes.length : 0;
  const hiddenColumnCount = activePage ? activePage.colCount - visibleColumnIndexes.length : 0;

  const orderedDialogColumns = useMemo(() => {
    const enabled = feedColumns.filter((column) => activeColumns.includes(column));
    const disabled = activeColumns.filter((column) => !enabled.includes(column));
    return [...enabled, ...disabled];
  }, [activeColumns, feedColumns]);

  const handleMoveFeedTarget = useCallback(
    (targetId: string, position: { row: number; col: number }) => {
      if (!activePage) return;

      const target = feedDataTargets.find((item) => item.id === targetId);
      if (!target) return;

      updatePageById(activePage.id, (page) =>
        moveFeedTargetInPage({
          page,
          target,
          position
        })
      );
      setInfo("Alimentador reposicionado.");
      setError(null);
    },
    [activePage, feedDataTargets, updatePageById]
  );

  const updateFeedTargetQuery = useCallback(
    (targetId: string, updater: (query: PlaygroundFeedQuery) => PlaygroundFeedQuery) => {
      if (!activePage) return;

      updatePageById(activePage.id, (page) => {
        const updatedAt = new Date().toISOString();
        let changed = false;

        const feeds = page.feeds.map((feed) => {
          if (feed.id === targetId) {
            changed = true;
            return {
              ...feed,
              query: updater(feed.query),
              renderedAt: updatedAt
            };
          }

          let fragmentChanged = false;
          const fragments = feed.fragments.map((fragment) => {
            if (fragment.id !== targetId) return fragment;

            fragmentChanged = true;
            changed = true;
            return {
              ...fragment,
              query: updater(fragment.query),
              renderedAt: updatedAt
            };
          });

          return fragmentChanged
            ? {
                ...feed,
                fragments,
                renderedAt: updatedAt
              }
            : feed;
        });

        return changed
          ? {
              ...page,
              feeds,
              updatedAt
            }
          : page;
      });
    },
    [activePage, updatePageById]
  );

  const updateFeedTargetDisplayOverride = useCallback(
    (targetId: string, column: string, displayColumn: string) => {
      if (!activePage) return;

      updatePageById(activePage.id, (page) => {
        const updatedAt = new Date().toISOString();
        let changed = false;

        const feeds = page.feeds.map((feed) => {
          if (feed.id === targetId) {
            changed = true;
            return {
              ...feed,
              displayColumnOverrides: {
                ...feed.displayColumnOverrides,
                [column]: displayColumn
              },
              renderedAt: updatedAt
            };
          }

          let fragmentChanged = false;
          const fragments = feed.fragments.map((fragment) => {
            if (fragment.id !== targetId) return fragment;

            fragmentChanged = true;
            changed = true;
            return {
              ...fragment,
              displayColumnOverrides: {
                ...fragment.displayColumnOverrides,
                [column]: displayColumn
              },
              renderedAt: updatedAt
            };
          });

          return fragmentChanged
            ? {
                ...feed,
                fragments,
                renderedAt: updatedAt
              }
            : feed;
        });

        return changed
          ? {
              ...page,
              feeds,
              updatedAt
            }
          : page;
      });
    },
    [activePage, updatePageById]
  );

  const clearFeedTargetDisplayOverride = useCallback(
    (targetId: string, column: string) => {
      if (!activePage) return;

      updatePageById(activePage.id, (page) => {
        const updatedAt = new Date().toISOString();
        let changed = false;

        const feeds = page.feeds.map((feed) => {
          if (feed.id === targetId) {
            if (!(column in feed.displayColumnOverrides)) return feed;

            const nextOverrides = { ...feed.displayColumnOverrides };
            delete nextOverrides[column];
            changed = true;
            return {
              ...feed,
              displayColumnOverrides: nextOverrides,
              renderedAt: updatedAt
            };
          }

          let fragmentChanged = false;
          const fragments = feed.fragments.map((fragment) => {
            if (fragment.id !== targetId || !(column in fragment.displayColumnOverrides)) return fragment;

            const nextOverrides = { ...fragment.displayColumnOverrides };
            delete nextOverrides[column];
            fragmentChanged = true;
            changed = true;
            return {
              ...fragment,
              displayColumnOverrides: nextOverrides,
              renderedAt: updatedAt
            };
          });

          return fragmentChanged
            ? {
                ...feed,
                fragments,
                renderedAt: updatedAt
              }
            : feed;
        });

        return changed
          ? {
              ...page,
              feeds,
              updatedAt
            }
          : page;
      });
    },
    [activePage, updatePageById]
  );

  const syncCursorWithPage = useCallback(
    (page: PlaygroundPage, preferred?: CellCoords | null) => {
      const nextCell = findNearestVisibleCell(page, preferred ?? activeCell ?? { row: 0, col: 0 });

      if (!nextCell) {
        setActiveCell(null);
        setSelection(null);
        setEditingCell(null);
        return;
      }

      setActiveCell(nextCell);
      setSelection(buildCellSelection(nextCell));
      setEditingCell(null);
    },
    [activeCell]
  );

  const refreshFeeds = useCallback(
    async (pageId: string, feedId?: string, silent = false) => {
      const page = workbook?.pages.find((item) => item.id === pageId);
      if (!page) return;

      const targetsToRefresh = feedId
        ? feedDataTargets.filter((target) => target.id === feedId || target.feedId === feedId)
        : feedDataTargets;
      if (targetsToRefresh.length === 0) return;
      const rowSpanBeforeByTargetId = Object.fromEntries(
        feedDataTargets.map((target) => [
          target.id,
          getTargetRenderedRowSpan(target.id, feedDataByTargetId) ?? getFeedTargetGridSize(target).rowSpan
        ])
      );
      const areasBefore = buildPlaygroundAreasFromTargets(feedDataTargets, feedDataByTargetId, rowSpanBeforeByTargetId);

      if (!silent) {
        setBusyMessage(feedId ? "Atualizando area..." : "Atualizando alimentadores...");
      }

      setError(null);

      try {
        const loadedRecords = await (feedId ? refreshFeedData(feedId) : refreshAllFeedData());
        const changedRecords = loadedRecords
          .map((record) => {
            const previousRows = rowSpanBeforeByTargetId[record.targetId] ?? 1;
            const nextRows = Math.max(1, record.rows.length + 1);
            return {
              record,
              previousRows,
              nextRows,
              deltaRows: nextRows - previousRows
            };
          })
          .filter((entry) => entry.deltaRows !== 0)
          .sort((left, right) => Math.abs(right.deltaRows) - Math.abs(left.deltaRows));
        const changed = changedRecords[0];

        if (changed) {
          const target = feedDataTargets.find((item) => item.id === changed.record.targetId);
          if (target) {
            const label = target.title ?? tableLabelByKey[target.table] ?? target.table;
            const shiftPlan = calculateAreaResizePlan({
              page,
              areas: areasBefore,
              areaId: target.id,
              nextRows: changed.nextRows,
              mode: "shift-range"
            });
            const fixedPlan = calculateAreaResizePlan({
              page,
              areas: areasBefore,
              areaId: target.id,
              nextRows: changed.nextRows,
              mode: "fixed"
            });

            setPendingAreaResize({
              targetId: target.id,
              label,
              previousRows: changed.previousRows,
              nextRows: changed.nextRows,
              plans: {
                "shift-range": shiftPlan,
                fixed: fixedPlan
              }
            });
            setAreaResizePreviewMode(shiftPlan.safeToApply ? "shift-range" : "fixed");
          }
        }

        if (!silent) {
          setInfo(
            changed
              ? "Alimentador atualizado. Revise o ajuste vertical sugerido."
              : feedId
                ? "Area atualizada."
                : "Todos os alimentadores da pagina foram atualizados."
          );
        }
      } catch (refreshError) {
        setError(buildErrorMessage(refreshError));
      } finally {
        if (!silent) {
          setBusyMessage(null);
        }
      }
    },
    [feedDataByTargetId, feedDataTargets, refreshAllFeedData, refreshFeedData, tableLabelByKey, workbook]
  );

  const ensureFeedRelationLoaded = useCallback(
    async (table: SheetKey) => {
      if (relationCache[table]) return relationCache[table] as GridListPayload;

      setFeedRelationDialogLoading(true);
      try {
        const data = await fetchSheetRows({
          table,
          requestAuth,
          page: 1,
          pageSize: 1000,
          query: "",
          matchMode: "contains",
          filters: {},
          sort: []
        });
        setRelationCache((current) => ({
          ...current,
          [table]: data
        }));
        return data;
      } finally {
        setFeedRelationDialogLoading(false);
      }
    },
    [relationCache, requestAuth]
  );

  function applyPendingAreaResize(modeToApply = areaResizePreviewMode) {
    if (!activePage || !pendingAreaResize) return;

    const plan = pendingAreaResize.plans[modeToApply];
    if (!plan.safeToApply) {
      setError("Este ajuste vertical tem conflito. Use o modo fixo ou reposicione as areas antes de aplicar.");
      return;
    }

    try {
      updatePageById(activePage.id, (page) => applyAreaResizePlan(page, plan));
      setPendingAreaResize(null);
      setInfo(
        modeToApply === "shift-range"
          ? "Area ajustada com deslocamento por faixa."
          : "Area ajustada em modo fixo."
      );
      setError(null);
    } catch (resizeError) {
      setError(buildErrorMessage(resizeError));
    }
  }

  function dismissPendingAreaResize() {
    setPendingAreaResize(null);
    setInfo("Ajuste vertical mantido sem deslocamento estrutural.");
    setError(null);
  }

  function openFeedRelationDialogFromFilter() {
    if (!feedFilterPopover || !activeFeedFilterTarget || !activeFeedFilterRelation) return;

    setFeedRelationDialog({
      targetId: feedFilterPopover.targetId,
      sourceColumn: feedFilterPopover.column,
      targetTable: activeFeedFilterRelation.table,
      keyColumn: activeFeedFilterRelation.keyColumn
    });
    closeFeedFilterPopover();
    void ensureFeedRelationLoaded(activeFeedFilterRelation.table);
  }

  function openHubFragmentRelationDialog(column: string) {
    if (!activeHubFeed || !activeHubFragment) return;

    const relation = RELATION_BY_SHEET_COLUMN[activeHubFeed.table]?.[column];
    if (!relation) return;

    setFeedRelationDialog({
      targetId: activeHubFragment.id,
      sourceColumn: column,
      targetTable: relation.table,
      keyColumn: relation.keyColumn
    });
    void ensureFeedRelationLoaded(relation.table);
  }

  function selectFeedRelationDisplayColumn(displayColumn: string) {
    if (!feedRelationDialog) return;

    updateFeedTargetDisplayOverride(feedRelationDialog.targetId, feedRelationDialog.sourceColumn, displayColumn);
    setFeedRelationDialog(null);
    setInfo(`FK ${feedRelationDialog.sourceColumn} expandida por ${displayColumn}.`);
    setError(null);
  }

  function openFeedColumnFilter(targetId: string, column: string, rect: DOMRect) {
    const target = feedDataTargets.find((item) => item.id === targetId);
    if (!target) return;
    if (target.lockedFilterColumns.includes(column)) {
      setInfo(`Filtro fixo em ${target.columnLabels[column] ?? column}.`);
      setError(null);
      return;
    }

    const { top, left, maxHeight } = getClampedPopoverPosition(rect);
    const label = target.columnLabels[column] ?? column;
    const localOptions = buildLocalFeedFilterOptions(
      feedDataByTargetId[targetId]?.rows ?? [],
      column,
      feedRelationDisplayLookupByTargetId[targetId] ?? {}
    );

    setFeedFilterSearch("");
    setFeedFilterDraftValues(parseFeedFilterSelection(target.query.filters[column] ?? ""));
    setFeedFilterOptions(localOptions);
    setFeedFilterPopover({
      targetId,
      column,
      label,
      top,
      left,
      maxHeight
    });
  }

  const toggleFeedFilterDraftValue = useCallback((value: string) => {
    setFeedFilterDraftValues((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return Array.from(next);
    });
  }, []);

  function applyFeedFilter() {
    if (!feedFilterPopover) return;
    if (activeFeedFilterTarget?.lockedFilterColumns.includes(feedFilterPopover.column)) {
      closeFeedFilterPopover();
      return;
    }

    updateFeedTargetQuery(feedFilterPopover.targetId, (query) =>
      withFeedFilterSelection(query, feedFilterPopover.column, feedFilterDraftValues)
    );
    closeFeedFilterPopover();
    setInfo(`Filtro aplicado em ${feedFilterPopover.label}.`);
    setError(null);
  }

  function clearFeedFilter() {
    if (!feedFilterPopover) return;
    if (activeFeedFilterTarget?.lockedFilterColumns.includes(feedFilterPopover.column)) {
      closeFeedFilterPopover();
      return;
    }

    updateFeedTargetQuery(feedFilterPopover.targetId, (query) => withFeedFilterSelection(query, feedFilterPopover.column, []));
    closeFeedFilterPopover();
    setInfo(`Filtro removido de ${feedFilterPopover.label}.`);
    setError(null);
  }

  function handleToggleFeedColumnSort(targetId: string, column: string, withChain: boolean) {
    const target = feedDataTargets.find((item) => item.id === targetId);
    const label = target?.columnLabels[column] ?? column;

    updateFeedTargetQuery(targetId, (query) => toggleFeedSort(query, column, withChain));
    setInfo(`Ordenacao atualizada em ${label}.`);
    setError(null);
  }

  function clearFeedTargetFilter(targetId: string, column: string) {
    const target = feedDataTargets.find((item) => item.id === targetId);
    if (!target || target.lockedFilterColumns.includes(column)) return;

    updateFeedTargetQuery(targetId, (query) => withFeedFilterSelection(query, column, []));
    setInfo(`Filtro removido de ${target.columnLabels[column] ?? column}.`);
    setError(null);
  }

  function clearFeedTargetUserFilters(targetId: string) {
    const target = feedDataTargets.find((item) => item.id === targetId);
    if (!target) return;

    const columns = getUserFilterEntries(target).map(([column]) => column);
    if (columns.length === 0) return;

    updateFeedTargetQuery(targetId, (query) => {
      let nextQuery = query;
      for (const column of columns) {
        nextQuery = withFeedFilterSelection(nextQuery, column, []);
      }
      return nextQuery;
    });
    setInfo(`${columns.length} filtro(s) removido(s).`);
    setError(null);
  }

  function openFragmentDialog(feedId: string) {
    const target = feedDataTargets.find((item) => item.id === feedId && item.kind === "feed");
    if (!target) return;

    const sourceColumn = target.columns[0] ?? "";
    const localOptions = sourceColumn
      ? buildLocalFeedFilterOptions(
          feedDataByTargetId[feedId]?.rows ?? [],
          sourceColumn,
          feedRelationDisplayLookupByTargetId[feedId] ?? {}
        )
      : [];

    setFragmentDialog({
      feedId,
      sourceColumn,
      selectedLiterals: [],
      search: "",
      options: localOptions,
      loading: Boolean(sourceColumn),
      groupSelected: false,
      groupLabel: ""
    });
    setInfo(null);
    setError(null);
  }

  function changeFragmentSourceColumn(sourceColumn: string) {
    setFragmentDialog((current) =>
      current
        ? {
            ...current,
            sourceColumn,
            selectedLiterals: [],
            search: "",
            options: sourceColumn ? current.options : [],
            loading: Boolean(sourceColumn),
            groupLabel: ""
          }
        : current
    );
  }

  const toggleFragmentLiteral = useCallback((literal: string) => {
    setFragmentDialog((current) => {
      if (!current) return current;

      const next = new Set(current.selectedLiterals);
      if (next.has(literal)) {
        next.delete(literal);
      } else {
        next.add(literal);
      }

      return {
        ...current,
        selectedLiterals: Array.from(next)
      };
    });
  }, []);

  function applyFragmentDialog() {
    if (!activePage || !fragmentDialog || !activeFragmentFeed) return;
    if (!fragmentDialog.sourceColumn) {
      setError("Escolha uma coluna para fragmentar.");
      return;
    }

    const existingLiterals = new Set(
      activeFragmentFeed.fragments
        .filter((fragment) => fragment.sourceColumn === fragmentDialog.sourceColumn)
        .map((fragment) => fragment.valueLiteral)
    );

    const targetSize = getFeedTargetGridSize({
      columns: activeFragmentFeed.columns,
      query: activeFragmentFeed.query
    });
    const occupiedRects = buildPlaygroundAreasFromTargets(feedDataTargets, feedDataByTargetId).map((area) => ({
      row: area.origin.row,
      col: area.origin.col,
      rowSpan: area.size.rows,
      colSpan: area.size.cols
    }));
    const usedIds = new Set([
      ...activePage.feeds.map((feed) => feed.id),
      ...activePage.feeds.flatMap((feed) => feed.fragments.map((fragment) => fragment.id))
    ]);

    const positionForIndex = (index: number) => {
      const preferredCol = activeFragmentFeed.position.col + activeFragmentFeed.columns.length + 1;
      const desiredPosition =
        preferredCol + targetSize.colSpan <= activePage.colCount
          ? {
              row: activeFragmentFeed.position.row + index * (targetSize.rowSpan + 1),
              col: preferredCol
            }
          : {
              row: activeFragmentFeed.position.row + (index + 1) * (targetSize.rowSpan + 1),
              col: activeFragmentFeed.position.col
            };
      const position = findNearestAvailableGridPosition({
        desiredPosition,
        size: targetSize,
        bounds: {
          rowCount: activePage.rowCount,
          colCount: activePage.colCount
        },
        occupiedRects
      });

      if (!position) {
        throw new Error("Nao ha espaco livre no grid para criar todos os fragmentos.");
      }

      occupiedRects.push({
        ...position,
        rowSpan: targetSize.rowSpan,
        colSpan: targetSize.colSpan
      });

      return position;
    };

    try {
      let fragments: PlaygroundFeed["fragments"];

      if (fragmentDialog.groupSelected) {
        // Grouped mode: single fragment that aggregates every selected literal.
        const selectedLiterals = fragmentDialog.selectedLiterals;
        if (selectedLiterals.length === 0) {
          setError("Selecione ao menos um valor para agrupar.");
          return;
        }

        const availableOptions = fragmentDialog.options.filter((option) =>
          selectedLiterals.includes(option.literal)
        );
        if (availableOptions.length === 0) {
          setError("Os valores selecionados nao estao disponiveis para fragmentacao.");
          return;
        }

        const composedLiteral = buildGroupedFragmentValueLiteral(
          availableOptions.map((option) => option.literal)
        );
        if (existingLiterals.has(composedLiteral)) {
          setError("Ja existe um fragmento com exatamente esses valores agrupados.");
          return;
        }

        const groupedFragment = createGroupedFeedFragment({
          feed: activeFragmentFeed,
          sourceColumn: fragmentDialog.sourceColumn,
          options: availableOptions,
          selectedLiterals,
          position: positionForIndex(0),
          id: createFragmentId(
            activeFragmentFeed.id,
            fragmentDialog.sourceColumn,
            composedLiteral || "grupo",
            0,
            usedIds
          ),
          label: fragmentDialog.groupLabel
        });

        if (!groupedFragment) {
          setError("Nao foi possivel criar o fragmento agrupado.");
          return;
        }

        fragments = [groupedFragment];
      } else {
        // Per-value mode: one fragment per selected literal (legacy behaviour).
        const selectedLiterals = fragmentDialog.selectedLiterals.filter(
          (literal) => !existingLiterals.has(literal)
        );

        if (selectedLiterals.length === 0) {
          setError("Selecione ao menos um valor ainda nao fragmentado.");
          return;
        }

        const availableOptions = fragmentDialog.options.filter((option) =>
          selectedLiterals.includes(option.literal)
        );
        if (availableOptions.length === 0) {
          setError("Os valores selecionados nao estao disponiveis para fragmentacao.");
          return;
        }

        fragments = createFeedFragments({
          feed: activeFragmentFeed,
          sourceColumn: fragmentDialog.sourceColumn,
          options: availableOptions,
          selectedLiterals,
          createId: (index, option) =>
            createFragmentId(activeFragmentFeed.id, fragmentDialog.sourceColumn, option.literal, index, usedIds),
          positionForIndex: (index) => positionForIndex(index)
        });
      }

      const now = new Date().toISOString();
      updatePageById(activePage.id, (page) => ({
        ...page,
        feeds: page.feeds.map((feed) =>
          feed.id === activeFragmentFeed.id
            ? {
                ...upsertFeedFragments(feed, fragments),
                renderedAt: now
              }
            : feed
        ),
        updatedAt: now
      }));
      setFragmentDialog(null);
      setInfo(
        fragmentDialog.groupSelected
          ? "Fragmento agrupado criado."
          : `${fragments.length} fragmento(s) criado(s).`
      );
      setError(null);
    } catch (fragmentError) {
      setError(buildErrorMessage(fragmentError));
    }
  }

  function removeFragmentTarget(fragmentId: string) {
    if (!activePage) return;

    const ownerFeed = activePage.feeds.find((feed) => feed.fragments.some((fragment) => fragment.id === fragmentId));
    const removedFragment = ownerFeed?.fragments.find((fragment) => fragment.id === fragmentId) ?? null;
    if (!ownerFeed || !removedFragment) return;

    const now = new Date().toISOString();

    updatePageById(activePage.id, (page) => ({
      ...page,
      feeds: page.feeds.map((feed) => {
        if (feed.id !== ownerFeed.id) return feed;

        return {
          ...removeFeedFragment(feed, fragmentId),
          renderedAt: now
        };
      }),
      updatedAt: now
    }));

    setFeedHubFragmentId((current) => (current === fragmentId ? null : current));
    setInfo(`Fragmento ${removedFragment.valueLabel || fragmentId} removido e devolvido ao alimentador pai.`);
    setError(null);
  }

  useEffect(() => {
    if (!activePage || !activeCell) {
      setFormulaValue("");
      return;
    }

    if (editingCell && editingCell.row === activeCell.row && editingCell.col === activeCell.col) {
      setFormulaValue(editingValue);
      return;
    }

    setFormulaValue(getCell(printablePage ?? activePage, activeCell.row, activeCell.col).value);
  }, [activeCell, activePage, editingCell, editingValue, printablePage]);

  useEffect(() => {
    if (!activePage) return;
    if (feedHubSelectedId && activePage.feeds.some((feed) => feed.id === feedHubSelectedId)) return;

    const nextFeed = activePage.feeds[0] ?? null;
    setFeedHubSelectedId(nextFeed?.id ?? null);
    setFeedHubFragmentId(null);
  }, [activePage, feedHubSelectedId]);

  useEffect(() => {
    if (!feedFilterPopover || !activeFeedFilterTarget) return;

    const controller = new AbortController();
    const targetRelationDisplayLookup =
      feedRelationDisplayLookupByTargetId[feedFilterPopover.targetId] ?? {};
    const localOptions = buildLocalFeedFilterOptions(
      feedDataByTargetId[feedFilterPopover.targetId]?.rows ?? [],
      feedFilterPopover.column,
      targetRelationDisplayLookup
    );
    const facetCacheKey = `${activeFeedFilterTarget.id}:${activeFeedFilterRequestKey}:${feedFilterPopover.column}`;
    const cachedOptions = feedFacetCacheRef.current.get(facetCacheKey);

    if (cachedOptions) {
      setFeedFilterLoading(false);
      setFeedFilterOptions(cachedOptions);
      return;
    }

    setFeedFilterLoading(true);
    setFeedFilterOptions(localOptions);

    fetchPlaygroundColumnFacets({
      table: activeFeedFilterTarget.table,
      column: feedFilterPopover.column,
      requestAuth,
      query: activeFeedFilterTarget.query.query,
      matchMode: activeFeedFilterTarget.query.matchMode,
      filters: activeFeedFilterTarget.query.filters,
      signal: controller.signal
    })
      .then((payload) => {
        const expandedOptions = applyRelationDisplayToFacetOptions(
          payload.options,
          feedFilterPopover.column,
          targetRelationDisplayLookup
        );
        feedFacetCacheRef.current.set(facetCacheKey, expandedOptions);
        setFeedFilterOptions(expandedOptions);
      })
      .catch((filterError) => {
        if (filterError instanceof DOMException && filterError.name === "AbortError") return;
        if (localOptions.length === 0) {
          setError(buildErrorMessage(filterError));
        } else {
          setInfo("Filtro aberto com os valores ja carregados do alimentador.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFeedFilterLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    activeFeedFilterRequestKey,
    activeFeedFilterTarget,
    feedDataByTargetId,
    feedFilterPopover,
    feedRelationDisplayLookupByTargetId,
    requestAuth
  ]);

  useEffect(() => {
    if (!fragmentDialogFeedId || !fragmentDialogSourceColumn || !activeFragmentTarget) return;

    const controller = new AbortController();
    const fragmentRelationDisplayLookup =
      feedRelationDisplayLookupByTargetId[fragmentDialogFeedId] ?? {};
    const localOptions = buildLocalFeedFilterOptions(
      feedDataByTargetId[fragmentDialogFeedId]?.rows ?? [],
      fragmentDialogSourceColumn,
      fragmentRelationDisplayLookup
    );
    const facetCacheKey = `${activeFragmentTarget.id}:${buildPlaygroundFeedRequestKey(activeFragmentTarget)}:${fragmentDialogSourceColumn}`;
    const cachedOptions = feedFacetCacheRef.current.get(facetCacheKey);

    if (cachedOptions) {
      setFragmentDialog((current) =>
        current && current.feedId === fragmentDialogFeedId && current.sourceColumn === fragmentDialogSourceColumn
          ? {
              ...current,
              loading: false,
              options: cachedOptions
            }
          : current
      );
      return;
    }

    setFragmentDialog((current) =>
      current && current.feedId === fragmentDialogFeedId && current.sourceColumn === fragmentDialogSourceColumn
        ? {
            ...current,
            loading: true,
            options: localOptions
          }
        : current
    );

    fetchPlaygroundColumnFacets({
      table: activeFragmentTarget.table,
      column: fragmentDialogSourceColumn,
      requestAuth,
      query: activeFragmentTarget.query.query,
      matchMode: activeFragmentTarget.query.matchMode,
      filters: activeFragmentTarget.query.filters,
      signal: controller.signal
    })
      .then((payload) => {
        const expandedOptions = applyRelationDisplayToFacetOptions(
          payload.options,
          fragmentDialogSourceColumn,
          fragmentRelationDisplayLookup
        );
        feedFacetCacheRef.current.set(facetCacheKey, expandedOptions);
        setFragmentDialog((current) =>
          current && current.feedId === fragmentDialogFeedId && current.sourceColumn === fragmentDialogSourceColumn
            ? {
                ...current,
                options: expandedOptions
              }
            : current
        );
      })
      .catch((fragmentError) => {
        if (fragmentError instanceof DOMException && fragmentError.name === "AbortError") return;
        if (localOptions.length === 0) {
          setError(buildErrorMessage(fragmentError));
        } else {
          setInfo("Fragmentacao aberta com os valores ja carregados do alimentador.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFragmentDialog((current) =>
            current && current.feedId === fragmentDialogFeedId && current.sourceColumn === fragmentDialogSourceColumn
              ? {
                  ...current,
                  loading: false
                }
              : current
          );
        }
      });

    return () => controller.abort();
  }, [
    activeFragmentTarget,
    feedDataByTargetId,
    feedRelationDisplayLookupByTargetId,
    fragmentDialogFeedId,
    fragmentDialogSourceColumn,
    requestAuth
  ]);

  useEffect(() => {
    const tables = new Set<SheetKey>();

    for (const target of feedDataTargets) {
      const relationMap = RELATION_BY_SHEET_COLUMN[target.table] ?? {};
      for (const column of Object.keys(target.displayColumnOverrides)) {
        const relation = relationMap[column];
        if (relation && !relationCache[relation.table]) {
          tables.add(relation.table);
        }
      }
    }

    for (const table of tables) {
      void ensureFeedRelationLoaded(table).catch((relationError) => {
        setError(buildErrorMessage(relationError));
      });
    }
  }, [ensureFeedRelationLoaded, feedDataTargets, relationCache]);

  useEffect(() => {
    function stopSelection() {
      selectionAnchorRef.current = null;
    }

    window.addEventListener("mouseup", stopSelection);

    return () => {
      window.removeEventListener("mouseup", stopSelection);
    };
  }, []);

  useEffect(() => {
    if (!resizeIntent || !activePage) return;
    const currentResize = resizeIntent;
    const currentPageId = activePage.id;

    function handlePointerMove(event: MouseEvent) {
      if (currentResize.kind === "column") {
        const delta = event.clientX - currentResize.startPointer;
        const nextSize = Math.max(56, Math.round(currentResize.startSize + delta));
        updatePageById(currentPageId, (page) => resizeColumns(page, currentResize.indexes, nextSize));
        return;
      }

      const delta = event.clientY - currentResize.startPointer;
      const nextSize = Math.max(24, Math.round(currentResize.startSize + delta));
      updatePageById(currentPageId, (page) => resizeRows(page, currentResize.indexes, nextSize));
    }

    function handlePointerUp() {
      setResizeIntent(null);
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [activePage, resizeIntent, updatePageById]);

  function addPage() {
    if (workbook && workbook.pages.length >= PLAYGROUND_MAX_PAGES) {
      return;
    }

    const nextPage = createPlaygroundPage((workbook?.pages.length ?? 0) + 1);
    const nextCell = findNearestVisibleCell(nextPage, { row: 0, col: 0 });

    setError(null);
    setInfo(null);

    setWorkbook((current) => {
      if (!current || current.pages.length >= PLAYGROUND_MAX_PAGES) return current;

      return {
        ...current,
        activePageId: nextPage.id,
        pages: [...current.pages, nextPage]
      };
    });

    setSelection(nextCell ? buildCellSelection(nextCell) : null);
    setActiveCell(nextCell);
    setEditingCell(null);
    setMode("edit");
    setPendingFeedConfig(null);
    setEditingFeedId(null);
    setFeedAnchorFilterColumns([]);
  }

  function switchPage(pageId: string) {
    const nextPage = workbook?.pages.find((page) => page.id === pageId) ?? null;

    setWorkbook((current) => {
      if (!current || current.activePageId === pageId) return current;

      return {
        ...current,
        activePageId: pageId
      };
    });

    const nextCell = nextPage ? findNearestVisibleCell(nextPage, { row: 0, col: 0 }) : null;
    setSelection(nextCell ? buildCellSelection(nextCell) : null);
    setActiveCell(nextCell);
    setEditingCell(null);
    setMode("edit");
    setPendingFeedConfig(null);
    setEditingFeedId(null);
    setFeedAnchorFilterColumns([]);
  }

  function promptRenameActivePage() {
    if (!activePage) return;

    const nextName = window.prompt("Novo nome da pagina", activePage.name);
    if (nextName == null) return;

    const trimmed = nextName.trim();
    if (!trimmed) {
      setError("Informe um nome valido para a pagina.");
      return;
    }

    updateActivePage((page) => ({
      ...page,
      name: trimmed,
      updatedAt: new Date().toISOString()
    }));
    setInfo(`Pagina renomeada para ${trimmed}.`);
    setError(null);
  }

  function removeActivePage() {
    if (!activePage || !workbook) return;
    if (workbook.pages.length <= 1) {
      setError("O playground precisa manter ao menos uma pagina.");
      return;
    }

    if (!window.confirm(`Excluir a pagina "${activePage.name}"?`)) return;

    const pageIndex = workbook.pages.findIndex((page) => page.id === activePage.id);
    const nextPages = workbook.pages.filter((page) => page.id !== activePage.id);
    const fallbackPage = nextPages[Math.max(0, pageIndex - 1)] ?? nextPages[0] ?? null;
    const fallbackCell = fallbackPage ? findNearestVisibleCell(fallbackPage, { row: 0, col: 0 }) : null;

    setWorkbook((current) => {
      if (!current) return current;

      return {
        ...current,
        activePageId: fallbackPage?.id ?? current.activePageId,
        pages: nextPages
      };
    });

    setSelection(fallbackCell ? buildCellSelection(fallbackCell) : null);
    setActiveCell(fallbackCell);
    setEditingCell(null);
    setFormulaValue("");
    setInfo(`Pagina ${activePage.name} removida.`);
    setError(null);
  }

  function toggleGridLines() {
    const nextValue = !workbook?.preferences.showGridLines;

    updateWorkbookPreferences((preferences) => ({
      ...preferences,
      showGridLines: nextValue
    }));
    setInfo(nextValue ? "Linhas de grade visiveis." : "Linhas de grade ocultas.");
    setError(null);
  }

  function startNewFeed() {
    if (feedTableOptions.length === 0) {
      setEditingFeedId(null);
      setFeedHubSelectedId(null);
      setFeedHubFragmentId(null);
      setFeedTitle("");
      setFeedTable("");
      setFeedColumns([]);
      setFeedColumnLabels({});
      setFeedPageSize(String(DEFAULT_PLAYGROUND_FEED_QUERY.pageSize));
      setFeedShowPaginationInHeader(false);
      setFeedAnchorFilterColumns([]);
      return;
    }

    const initialTable = feedTableOptions[0]?.key ?? "";
    const cachedColumns = initialTable ? tableColumnsByKey[initialTable] ?? [] : [];

    setEditingFeedId(null);
    setFeedHubSelectedId(null);
    setFeedHubFragmentId(null);
    setFeedTitle("");
    setFeedTable(initialTable);
    setFeedPageSize(String(DEFAULT_PLAYGROUND_FEED_QUERY.pageSize));
    setFeedShowPaginationInHeader(false);
    setFeedAnchorFilterColumns([]);

    if (cachedColumns.length > 0) {
      applyFeedColumnsFromSource(cachedColumns);
      return;
    }

    setFeedColumns([]);
    setFeedColumnLabels({});

    if (initialTable) {
      void loadTableColumns(initialTable, { initialize: true });
    }
  }

  function editFeed(feed: PlaygroundFeed) {
    const query = normalizeFeedQuery(feed.query);

    setEditingFeedId(feed.id);
    setFeedHubSelectedId(feed.id);
    setFeedHubFragmentId(null);
    setFeedTitle(feed.title ?? "");
    setFeedTable(feed.table);
    setFeedPageSize(String(query.pageSize));
    setFeedShowPaginationInHeader(feed.showPaginationInHeader === true);
    setFeedAnchorFilterColumns(normalizeAnchorFilterColumns(query, feed.anchorFilterColumns));

    const cachedColumns = tableColumnsByKey[feed.table] ?? [];
    if (cachedColumns.length > 0) {
      applyFeedColumnsFromSource(cachedColumns, feed.columns, feed.columnLabels);
      return;
    }

    setFeedColumns(feed.columns);
    setFeedColumnLabels(feed.columnLabels);
    void loadTableColumns(feed.table, {
      initialize: true,
      selected: feed.columns,
      labels: feed.columnLabels
    });
  }

  function openFeedDialog() {
    if (!activePage) return;
    if (feedTableOptions.length === 0 && activePage.feeds.length === 0) {
      setError("Nenhuma tabela disponivel para o seu perfil no playground.");
      return;
    }

    setFeedDialogOpen(true);
    setError(null);
    setInfo(null);

    if (activePage.feeds.length > 0) {
      const selectedFeed = activePage.feeds.find((feed) => feed.id === feedHubSelectedId) ?? activePage.feeds[0];
      editFeed(selectedFeed);
      return;
    }

    if (!feedTable) {
      startNewFeed();
    }
  }

  function openFeedHubForFeed(feedId: string) {
    if (!activePage) return;

    const feed = activePage.feeds.find((item) => item.id === feedId);
    if (!feed) return;

    setFeedDialogOpen(true);
    setError(null);
    setInfo(null);
    editFeed(feed);
  }

  function closeFeedDialog() {
    setFeedDialogOpen(false);
  }

  function handleFeedTableChange(nextTable: SheetKey) {
    setFeedTable(nextTable);
    setFeedAnchorFilterColumns([]);

    const cachedColumns = tableColumnsByKey[nextTable] ?? [];
    if (cachedColumns.length > 0) {
      applyFeedColumnsFromSource(cachedColumns);
      return;
    }

    setFeedColumns([]);
    setFeedColumnLabels({});
    void loadTableColumns(nextTable, { initialize: true });
  }

  function toggleFeedColumn(column: string) {
    setFeedColumns((current) => toggleOrderedValue(current, column, !current.includes(column), activeColumns));

    setFeedColumnLabels((current) => ({
      ...current,
      [column]: current[column] ?? column
    }));
  }

  function moveFeedColumn(column: string, direction: "up" | "down") {
    setFeedColumns((current) => moveOrderedValue(current, column, direction));
  }

  function updateFeedColumnLabel(column: string, value: string) {
    setFeedColumnLabels((current) => ({
      ...current,
      [column]: value
    }));
  }

  function toggleFeedAnchorFilterColumn(column: string) {
    setFeedAnchorFilterColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return Array.from(next);
    });
  }

  function selectHubFeed(feed: PlaygroundFeed) {
    editFeed(feed);
  }

  function updateFragmentInActivePage(
    feedId: string,
    fragmentId: string,
    updater: (feed: PlaygroundFeed, fragment: PlaygroundFeed["fragments"][number]) => PlaygroundFeed["fragments"][number]
  ) {
    if (!activePage) return;

    const now = new Date().toISOString();
    updatePageById(activePage.id, (page) => ({
      ...page,
      feeds: page.feeds.map((feed) => {
        if (feed.id !== feedId) return feed;

        let changed = false;
        const fragments = feed.fragments.map((fragment) => {
          if (fragment.id !== fragmentId) return fragment;
          changed = true;
          return updater(feed, fragment);
        });

        return changed
          ? {
              ...feed,
              fragments,
              renderedAt: now
            }
          : feed;
      }),
      updatedAt: now
    }));
  }

  function updateHubFragmentLabel(value: string) {
    if (!activeHubFeed || !activeHubFragment) return;

    updateFragmentInActivePage(activeHubFeed.id, activeHubFragment.id, (_feed, fragment) => ({
      ...fragment,
      valueLabel: value,
      renderedAt: new Date().toISOString()
    }));
  }

  function toggleHubFragmentColumn(column: string) {
    if (!activeHubFeed || !activeHubFragment) return;

    const currentColumns = getFeedFragmentColumns(activeHubFeed, activeHubFragment);
    if (currentColumns.includes(column) && currentColumns.length === 1) {
      setError("O fragmento precisa manter ao menos uma coluna.");
      return;
    }

    updateFragmentInActivePage(activeHubFeed.id, activeHubFragment.id, (feed, fragment) => {
      const currentColumns = getFeedFragmentColumns(feed, fragment);
      const enabled = currentColumns.includes(column);
      const nextColumns = enabled
        ? currentColumns.filter((entry) => entry !== column)
        : toggleOrderedValue(currentColumns, column, true, feed.columns);

      return {
        ...fragment,
        columns: nextColumns,
        columnLabels: {
          ...getFeedFragmentColumnLabels(feed, fragment),
          [column]: getFeedFragmentColumnLabels(feed, fragment)[column] ?? feed.columnLabels[column] ?? column
        },
        renderedAt: new Date().toISOString()
      };
    });
    setError(null);
  }

  function moveHubFragmentColumn(column: string, direction: "up" | "down") {
    if (!activeHubFeed || !activeHubFragment) return;

    updateFragmentInActivePage(activeHubFeed.id, activeHubFragment.id, (feed, fragment) => ({
      ...fragment,
      columns: moveOrderedValue(getFeedFragmentColumns(feed, fragment), column, direction),
      renderedAt: new Date().toISOString()
    }));
  }

  function updateHubFragmentColumnLabel(column: string, value: string) {
    if (!activeHubFeed || !activeHubFragment) return;

    updateFragmentInActivePage(activeHubFeed.id, activeHubFragment.id, (feed, fragment) => ({
      ...fragment,
      columnLabels: {
        ...getFeedFragmentColumnLabels(feed, fragment),
        [column]: value
      },
      renderedAt: new Date().toISOString()
    }));
  }

  function buildDialogFeedConfig(): PendingFeedConfig | null {
    if (!feedTable || feedColumns.length === 0) {
      setError("Escolha uma tabela e ao menos uma coluna para o alimentador.");
      return null;
    }

    const requestedPageSize = Number(feedPageSize);
    if (!Number.isFinite(requestedPageSize) || requestedPageSize < 1) {
      setError("Informe uma quantidade valida de linhas para renderizar.");
      return null;
    }

    const existingQuery = currentEditingFeed ? normalizeFeedQuery(currentEditingFeed.query) : DEFAULT_PLAYGROUND_FEED_QUERY;
    const normalizedQuery = normalizeFeedQuery({
      ...existingQuery,
      page: existingQuery.pageSize === Math.round(requestedPageSize) ? existingQuery.page : 1,
      pageSize: requestedPageSize
    });

    return {
      id: editingFeedId ?? undefined,
      table: feedTable,
      title: feedTitle.trim() || undefined,
      columns: feedColumns,
      columnLabels: feedColumns.reduce<Record<string, string>>((acc, column) => {
        const candidate = feedColumnLabels[column]?.trim();
        acc[column] = candidate ? candidate : column;
        return acc;
      }, {}),
      query: normalizedQuery,
      showPaginationInHeader: feedShowPaginationInHeader,
      anchorFilterColumns: normalizeAnchorFilterColumns(normalizedQuery, feedAnchorFilterColumns)
    };
  }

  async function applyFeedConfigAtTarget(config: PendingFeedConfig, row: number, col: number) {
    if (!activePage) return;

    const currentPageId = activePage.id;
    const existingFeed = config.id ? activePage.feeds.find((feed) => feed.id === config.id) ?? null : null;
    setBusyMessage(config.id ? "Salvando alimentador..." : "Criando alimentador...");
    setError(null);

    try {
      const result = upsertFeedDefinitionInPage({
        page: activePage,
        feed: {
          id: config.id,
          table: config.table,
          title: config.title,
          columns: config.columns,
          columnLabels: config.columnLabels,
          targetRow: row,
          targetCol: col,
          query: config.query,
          displayColumnOverrides: existingFeed?.displayColumnOverrides,
          showPaginationInHeader: config.showPaginationInHeader,
          fragments: existingFeed?.fragments ?? [],
          anchorFilterColumns: config.anchorFilterColumns
        }
      });
      const nextPage = result.page;

      updatePageById(currentPageId, () => nextPage);
      void refreshFeedData(result.feed.id);

      const nextCell = findNearestVisibleCell(nextPage, { row, col }) ?? { row, col };
      const endRow = Math.min(nextPage.rowCount - 1, row + result.feed.query.pageSize);
      const endCol = Math.min(nextPage.colCount - 1, col + config.columns.length - 1);
      const rowOverflow = Math.max(0, row + result.feed.query.pageSize + 1 - PLAYGROUND_MAX_ROWS);
      const colOverflow = Math.max(0, col + config.columns.length - PLAYGROUND_MAX_COLS);
      const truncationMessage =
        rowOverflow > 0 || colOverflow > 0
          ? ` Parte do resultado foi truncada (${rowOverflow} linhas e ${colOverflow} colunas fora do limite).`
          : "";

      setSelection({
        startRow: row,
        startCol: col,
        endRow,
        endCol
      });
      setActiveCell(nextCell);
      setEditingCell(null);
      setMode("edit");
      setPendingFeedConfig(null);
      setFeedDialogOpen(false);
      setInfo(
        `Alimentador ${config.table} ${config.id ? "atualizado" : "inserido"} em ${formatCellAddress(row, col)}. Dados carregados em cache proprio.${truncationMessage}`
      );
      setError(null);
    } catch (applyError) {
      setError(buildErrorMessage(applyError));
    } finally {
      setBusyMessage(null);
    }
  }

  function startTargetSelectionForFeed() {
    const config = buildDialogFeedConfig();
    if (!config) return;

    setPendingFeedConfig(config);
    setMode("target_select");
    setFeedDialogOpen(false);
    setInfo(
      config.id
        ? "Clique na nova celula inicial para reposicionar o alimentador."
        : "Modo de destino ativo. Clique na celula inicial onde o alimentador deve ser renderizado."
    );
    setError(null);
  }

  async function saveFeedOnCurrentTarget() {
    if (!activePage) return;

    const config = buildDialogFeedConfig();
    if (!config) return;

    const existingFeed = config.id ? activePage.feeds.find((feed) => feed.id === config.id) ?? null : null;
    if (!existingFeed) {
      startTargetSelectionForFeed();
      return;
    }

    await applyFeedConfigAtTarget(config, existingFeed.targetRow, existingFeed.targetCol);
  }

  function cancelTargetSelection() {
    setMode("edit");
    setPendingFeedConfig(null);
    setInfo("Modo de destino cancelado.");
  }

  async function placePendingFeed(row: number, col: number) {
    if (!pendingFeedConfig) return;
    await applyFeedConfigAtTarget(pendingFeedConfig, row, col);
  }

  function applyPaintToSelection() {
    if (!selection) {
      setError("Selecione uma ou mais celulas antes de aplicar pintura.");
      return;
    }

    updateActivePage((page) =>
      paintSelection(page, selection, {
        background: fillColor,
        color: textColor,
        bold: paintBold
      })
    );
    setError(null);
    setInfo(`Estilo aplicado em ${formatSelectionAddress(selection)}.`);
  }

  function resetSelectionPaint() {
    if (!selection) {
      setError("Selecione uma ou mais celulas antes de limpar a pintura.");
      return;
    }

    updateActivePage((page) => clearSelectionStyle(page, selection));
    setError(null);
    setInfo(`Pintura removida de ${formatSelectionAddress(selection)}.`);
  }

  function extendRows() {
    if (!activePage) return;

    const nextPage = ensurePageSize(activePage, activePage.rowCount + 20, activePage.colCount);
    updatePageById(activePage.id, () => nextPage);
    setInfo(`Pagina ajustada para ${nextPage.rowCount} linhas.`);
    setError(null);
  }

  function extendColumns() {
    if (!activePage) return;

    const nextPage = ensurePageSize(activePage, activePage.rowCount, activePage.colCount + 4);
    updatePageById(activePage.id, () => nextPage);
    setInfo(`Pagina ajustada para ${nextPage.colCount} colunas.`);
    setError(null);
  }

  function shrinkRows() {
    if (!activePage) return;

    const nextPage = trimPageSize(activePage, activePage.rowCount - 20, activePage.colCount);
    const removedFeeds = activePage.feeds.length - nextPage.feeds.length;

    updatePageById(activePage.id, () => nextPage);
    syncCursorWithPage(nextPage, activeCell);
    setInfo(
      `Pagina ajustada para ${nextPage.rowCount} linhas.${removedFeeds > 0 ? ` ${removedFeeds} alimentador(es) fora do novo limite foram removidos.` : ""}`
    );
    setError(null);
  }

  function shrinkColumns() {
    if (!activePage) return;

    const nextPage = trimPageSize(activePage, activePage.rowCount, activePage.colCount - 4);
    const removedFeeds = activePage.feeds.length - nextPage.feeds.length;

    updatePageById(activePage.id, () => nextPage);
    syncCursorWithPage(nextPage, activeCell);
    setInfo(
      `Pagina ajustada para ${nextPage.colCount} colunas.${removedFeeds > 0 ? ` ${removedFeeds} alimentador(es) fora do novo limite foram removidos.` : ""}`
    );
    setError(null);
  }

  function hideSelectedRows() {
    if (!activePage) return;

    const targetRows = getSelectedRowIndexes(selection, activeCell).filter(
      (row) => row >= 0 && row < activePage.rowCount && !isRowHidden(activePage, row)
    );

    if (targetRows.length === 0) {
      setError("Selecione ao menos uma linha visivel para ocultar.");
      return;
    }

    if (targetRows.length >= visibleRowIndexes.length) {
      setError("O playground precisa manter ao menos uma linha visivel.");
      return;
    }

    const nextPage = hideRows(activePage, targetRows);
    updatePageById(activePage.id, () => nextPage);
    syncCursorWithPage(nextPage, activeCell);
    setInfo(`${targetRows.length} linha(s) ocultada(s).`);
    setError(null);
  }

  function hideSelectedColumns() {
    if (!activePage) return;

    const targetCols = getSelectedColumnIndexes(selection, activeCell).filter(
      (col) => col >= 0 && col < activePage.colCount && !isColumnHidden(activePage, col)
    );

    if (targetCols.length === 0) {
      setError("Selecione ao menos uma coluna visivel para ocultar.");
      return;
    }

    if (targetCols.length >= visibleColumnIndexes.length) {
      setError("O playground precisa manter ao menos uma coluna visivel.");
      return;
    }

    const nextPage = hideColumns(activePage, targetCols);
    updatePageById(activePage.id, () => nextPage);
    syncCursorWithPage(nextPage, activeCell);
    setInfo(`${targetCols.length} coluna(s) ocultada(s).`);
    setError(null);
  }

  function restoreHiddenRows() {
    if (!activePage || hiddenRowCount === 0) return;

    const nextPage = showAllRows(activePage);
    updatePageById(activePage.id, () => nextPage);
    setInfo("Todas as linhas ocultas voltaram a aparecer.");
    setError(null);
  }

  function restoreHiddenColumns() {
    if (!activePage || hiddenColumnCount === 0) return;

    const nextPage = showAllColumns(activePage);
    updatePageById(activePage.id, () => nextPage);
    setInfo("Todas as colunas ocultas voltaram a aparecer.");
    setError(null);
  }

  function applyValueToCell(target: CellCoords, value: string) {
    updateActivePage((page) => updateCellValue(page, target.row, target.col, value));
    setInfo(`Celula ${formatCellAddress(target.row, target.col)} atualizada.`);
    setError(null);
  }

  function selectSingleCell(cell: CellCoords) {
    gridScrollRef.current?.focus();
    setEditingCell(null);
    setActiveCell(cell);
    setSelection(buildCellSelection(cell));
  }

  function selectRow(row: number) {
    if (!activePage) return;

    const focusCol =
      findNearestVisibleIndex(activePage.colCount, (index) => isColumnHidden(activePage, index), activeCell?.col ?? 0) ?? 0;

    gridScrollRef.current?.focus();
    setEditingCell(null);
    setActiveCell({ row, col: focusCol });
    setSelection({
      startRow: row,
      startCol: 0,
      endRow: row,
      endCol: activePage.colCount - 1
    });
  }

  function selectColumn(col: number) {
    if (!activePage) return;

    const focusRow =
      findNearestVisibleIndex(activePage.rowCount, (index) => isRowHidden(activePage, index), activeCell?.row ?? 0) ?? 0;

    gridScrollRef.current?.focus();
    setEditingCell(null);
    setActiveCell({ row: focusRow, col });
    setSelection({
      startRow: 0,
      startCol: col,
      endRow: activePage.rowCount - 1,
      endCol: col
    });
  }

  function selectWholeSheet() {
    if (!activePage) return;

    const nextCell = findNearestVisibleCell(activePage, activeCell ?? { row: 0, col: 0 });
    gridScrollRef.current?.focus();
    setEditingCell(null);
    setActiveCell(nextCell);
    setSelection({
      startRow: 0,
      startCol: 0,
      endRow: activePage.rowCount - 1,
      endCol: activePage.colCount - 1
    });
  }

  function autoFitColumnsFromSelection(col: number) {
    if (!activePage) return;

    const targetCols = getResizeTargetColumns(activePage, selection, col);
    const widths = calculateAutoColumnWidths(printablePage ?? activePage, targetCols);
    updatePageById(activePage.id, (page) => applyColumnWidths(page, widths));
    setInfo(`${targetCols.length} coluna(s) ajustada(s) ao conteudo.`);
    setError(null);
  }

  function autoFitRowsFromSelection(row: number) {
    if (!activePage) return;

    const targetRows = getResizeTargetRows(activePage, selection, row);
    const heights = calculateAutoRowHeights(printablePage ?? activePage, targetRows);
    updatePageById(activePage.id, (page) => applyRowHeights(page, heights));
    setInfo(`${targetRows.length} linha(s) ajustada(s) ao conteudo.`);
    setError(null);
  }

  function beginCellEdit(row: number, col: number) {
    if (!activePage || mode === "target_select") return;

    const cell = getCell(printablePage ?? activePage, row, col);
    if (cell.feedId) {
      setInfo("Celulas de alimentadores sao derivadas da origem. Reconfigure ou atualize o alimentador para alterar estes dados.");
      setError(null);
      return;
    }

    setActiveCell({ row, col });
    setEditingCell({ row, col });
    setEditingValue(cell.value);
    setSelection(buildCellSelection({ row, col }));
  }

  function commitCellEdit() {
    if (!editingCell) return;

    applyValueToCell(editingCell, editingValue);
    setEditingCell(null);
  }

  function cancelCellEdit() {
    setEditingCell(null);
    setEditingValue("");
  }

  function applyFormulaBarValue() {
    if (!activeCell) {
      setError("Selecione uma celula antes de aplicar um valor.");
      return;
    }

    if (printablePage && getCell(printablePage, activeCell.row, activeCell.col).feedId) {
      setError("Nao e possivel editar diretamente uma celula derivada de alimentador.");
      return;
    }

    setEditingCell(null);
    applyValueToCell(activeCell, formulaValue);
  }

  function clearSelectedValues() {
    if (!activePage) return;

    const targetSelection = selection
      ? clampSelectionToPage(activePage, selection)
      : activeCell
        ? buildCellSelection(activeCell)
        : null;

    if (!targetSelection) {
      setError("Selecione uma area antes de limpar os valores.");
      return;
    }

    updateActivePage((page) => clearSelectionValues(page, targetSelection));
    setEditingCell(null);
    setInfo(`Conteudo limpo em ${formatSelectionAddress(targetSelection)}.`);
    setError(null);
  }

  function handleCellPointerDown(event: ReactMouseEvent<HTMLElement>, row: number, col: number) {
    if (mode === "target_select") return;

    event.preventDefault();
    gridScrollRef.current?.focus();
    setEditingCell(null);
    selectionAnchorRef.current = { row, col };
    setActiveCell({ row, col });
    setSelection(buildCellSelection({ row, col }));
  }

  function handleCellPointerEnter(row: number, col: number) {
    const anchor = selectionAnchorRef.current;
    if (!anchor || mode === "target_select") return;

    setSelection({
      startRow: anchor.row,
      startCol: anchor.col,
      endRow: row,
      endCol: col
    });
  }

  function handleCellClick(row: number, col: number) {
    if (mode !== "target_select") return;
    void placePendingFeed(row, col);
  }

  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!activePage || mode === "target_select") return;
    if (editingCell) return;

    const currentPage = activePage;

    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;

    const current = activeCell ?? findNearestVisibleCell(currentPage, { row: 0, col: 0 }) ?? { row: 0, col: 0 };

    function moveTo(rowDelta: number, colDelta: number) {
      let nextRow = current.row;
      let nextCol = current.col;

      if (rowDelta !== 0) {
        let probe = current.row;

        while (true) {
          const candidate = probe + rowDelta;
          if (candidate < 0 || candidate >= currentPage.rowCount) {
            break;
          }

          probe = candidate;
          if (!isRowHidden(currentPage, probe)) {
            nextRow = probe;
            break;
          }
        }
      }

      if (colDelta !== 0) {
        let probe = current.col;

        while (true) {
          const candidate = probe + colDelta;
          if (candidate < 0 || candidate >= currentPage.colCount) {
            break;
          }

          probe = candidate;
          if (!isColumnHidden(currentPage, probe)) {
            nextCol = probe;
            break;
          }
        }
      }

      selectSingleCell({ row: nextRow, col: nextCol });
    }

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        moveTo(-1, 0);
        return;
      case "ArrowDown":
        event.preventDefault();
        moveTo(1, 0);
        return;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(0, -1);
        return;
      case "ArrowRight":
        event.preventDefault();
        moveTo(0, 1);
        return;
      case "Tab":
        event.preventDefault();
        moveTo(0, event.shiftKey ? -1 : 1);
        return;
      case "Enter":
        event.preventDefault();
        beginCellEdit(current.row, current.col);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        clearSelectedValues();
        return;
      default:
        break;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (printablePage && getCell(printablePage, current.row, current.col).feedId) {
        setInfo("Celulas de alimentadores sao derivadas da origem. Use a configuracao do alimentador para mudar estes dados.");
        setError(null);
        return;
      }
      setActiveCell(current);
      setEditingCell(current);
      setEditingValue(event.key);
      setSelection(buildCellSelection(current));
    }
  }

  function removeFeed(feed: PlaygroundFeed) {
    if (!activePage) return;
    if (!window.confirm(`Remover o alimentador ${feed.table} desta pagina?`)) return;

    updatePageById(activePage.id, (page) => removeFeedFromPage(page, feed.id));

    if (editingFeedId === feed.id) {
      setEditingFeedId(null);
      setFeedAnchorFilterColumns([]);
      if (feedTableOptions.length > 0) {
        startNewFeed();
      }
    }

    setInfo(`Alimentador ${feed.table} removido.`);
    setError(null);
  }

  if (!workbook || !activePage) {
    return null;
  }

  const toolbarGridLabel = `${activePage.rowCount} linhas x ${activePage.colCount} colunas`;

  return (
    <main className="playground-shell">
      <WorkspaceHeader
        actor={actor}
        title="Playground"
        actions={
          <button type="button" className="btn sheet-signout-btn" onClick={() => void onSignOut()}>
            Sair
          </button>
        }
      />

      {busyMessage ? <p className="playground-banner is-busy">{busyMessage}</p> : null}
      {!busyMessage && feedDataRefreshing ? <p className="playground-banner is-busy">Sincronizando alimentadores...</p> : null}
      {error ? <p className="playground-banner is-error">{error}</p> : null}
      {!error && feedDataError ? <p className="playground-banner is-error">{feedDataError}</p> : null}
      {info ? <p className="playground-banner is-info">{info}</p> : null}

      <section className="playground-toolbar" aria-label="Ferramentas do playground">
        <div className="playground-toolbar-row">
          <div className="playground-tool-cluster playground-tool-cluster-pages">
            <div className="playground-page-tabs" role="tablist" aria-label="Paginas do playground">
              {workbook.pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className={`playground-page-tab ${page.id === activePage.id ? "is-active" : ""}`}
                  onClick={() => switchPage(page.id)}
                  role="tab"
                  aria-selected={page.id === activePage.id}
                  title={page.name}
                >
                  {page.name}
                </button>
              ))}
            </div>
            <PlaygroundToolButton label="Nova pagina" onClick={addPage} disabled={workbook.pages.length >= PLAYGROUND_MAX_PAGES}>
              +
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Renomear pagina" onClick={promptRenameActivePage}>
              Ab
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Excluir pagina" onClick={removeActivePage} disabled={workbook.pages.length <= 1}>
              Del
            </PlaygroundToolButton>
          </div>

          <div className="playground-tool-cluster playground-tool-cluster-formula">
            <span className="playground-name-box" title="Celula ativa">
              {activeCell ? formatCellAddress(activeCell.row, activeCell.col) : "--"}
            </span>
            <input
              className="playground-formula-input"
              value={formulaValue}
              onChange={(event) => setFormulaValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyFormulaBarValue();
                }
              }}
              aria-label="Valor da celula ativa"
              placeholder="Valor"
            />
            <PlaygroundToolButton label="Aplicar valor" onClick={applyFormulaBarValue}>
              OK
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Limpar valor" onClick={clearSelectedValues}>
              X
            </PlaygroundToolButton>
          </div>

          <div className="playground-tool-cluster">
            <label className="playground-color-swatch" title="Cor de fundo" aria-label="Cor de fundo">
              <span style={{ backgroundColor: fillColor }} />
              <input type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} />
            </label>
            <label className="playground-color-swatch is-text" title="Cor do texto" aria-label="Cor do texto">
              <strong style={{ color: textColor }}>A</strong>
              <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} />
            </label>
            <PlaygroundToolButton label="Negrito" onClick={() => setPaintBold((current) => !current)} active={paintBold}>
              B
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Aplicar formatacao" onClick={applyPaintToSelection}>
              Fmt
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Limpar formatacao" onClick={resetSelectionPaint}>
              Tx
            </PlaygroundToolButton>
          </div>

          <div className="playground-tool-cluster">
            <PlaygroundToolButton label="Adicionar 20 linhas" onClick={extendRows}>
              +R
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Remover 20 linhas" onClick={shrinkRows} disabled={activePage.rowCount <= PLAYGROUND_MIN_ROWS}>
              -R
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Adicionar 4 colunas" onClick={extendColumns}>
              +C
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Remover 4 colunas" onClick={shrinkColumns} disabled={activePage.colCount <= PLAYGROUND_MIN_COLS}>
              -C
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Ocultar linhas selecionadas" onClick={hideSelectedRows}>
              Hr
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Ocultar colunas selecionadas" onClick={hideSelectedColumns}>
              Hc
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Mostrar linhas" onClick={restoreHiddenRows} disabled={hiddenRowCount === 0}>
              Sr
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Mostrar colunas" onClick={restoreHiddenColumns} disabled={hiddenColumnCount === 0}>
              Sc
            </PlaygroundToolButton>
            <PlaygroundToolButton
              label={workbook.preferences.showGridLines ? "Ocultar linhas de grade" : "Mostrar linhas de grade"}
              onClick={toggleGridLines}
              active={workbook.preferences.showGridLines}
            >
              #
            </PlaygroundToolButton>
          </div>

          <div className="playground-tool-cluster">
            <PlaygroundToolButton label="Alimentadores" onClick={openFeedDialog} wide>
              Feed
            </PlaygroundToolButton>
            <PlaygroundToolButton
              label="Atualizar dados"
              onClick={() => void refreshFeeds(activePage.id)}
              disabled={activePage.feeds.length === 0}
            >
              Sync
            </PlaygroundToolButton>
            {mode === "target_select" ? (
              <PlaygroundToolButton label="Cancelar destino" onClick={cancelTargetSelection}>
                Esc
              </PlaygroundToolButton>
            ) : null}
            <span className={`playground-mode-pill ${mode === "target_select" ? "is-target" : ""}`} title="Modo atual">
              {mode === "target_select" ? "Destino" : "Editar"}
            </span>
          </div>

          <div className="playground-tool-cluster">
            <PlaygroundToolButton label="Imprimir pagina" onClick={() => openPrintDialog("page")}>
              P
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Imprimir selecao" onClick={() => openPrintDialog("selection")}>
              Ps
            </PlaygroundToolButton>
          </div>
        </div>

        <div className="playground-toolbar-row playground-toolbar-row-status">
          <span title="Selecao">{formatSelectionAddress(selection)}</span>
          <span title="Area usada">{pageUsedRange ? formatSelectionAddress(pageUsedRange) : "Vazia"}</span>
          <span title="Tamanho da planilha">{toolbarGridLabel}</span>
          <span title="Dados vivos">{activePage.feeds.length} feed(s)</span>
          <span title="Atualizada">{formatRenderedAt(activePage.updatedAt)}</span>
          {hiddenRowCount > 0 ? <span title="Linhas ocultas">{hiddenRowCount}r ocultas</span> : null}
          {hiddenColumnCount > 0 ? <span title="Colunas ocultas">{hiddenColumnCount}c ocultas</span> : null}
        </div>
      </section>

      <section className="playground-sheet-card">
        <div className="playground-sheet-meta">
          <p>
            Clique no cabecalho para selecionar uma linha ou coluna inteira. Use o canto superior esquerdo para
            selecionar a pagina toda.
          </p>
          {mode === "target_select" ? (
            <p className="playground-sheet-hint">
              Modo de destino ativo. Clique na celula inicial em que o alimentador deve aparecer.
            </p>
          ) : null}
        </div>

        <PlaygroundGridCanvas
          page={printablePage ?? activePage}
          mode={mode}
          scrollRef={gridScrollRef}
          selection={normalizedSelection}
          activeCell={activeCell}
          editingCell={editingCell}
          editingValue={editingValue}
          feedTargets={feedDataTargets}
          feedRecordsByTargetId={feedDataByTargetId}
          tableLabelByKey={tableLabelByKey}
          showGridLines={workbook.preferences.showGridLines}
          areaResizePreviewPlan={activeAreaResizePlan}
          onKeyDown={handleGridKeyDown}
          onSelectWholeSheet={selectWholeSheet}
          onSelectColumn={selectColumn}
          onSelectRow={selectRow}
          onColumnResizeStart={(col, pointerX) =>
            setResizeIntent({
              kind: "column",
              index: col,
              indexes: getResizeTargetColumns(activePage, selection, col),
              startPointer: pointerX,
              startSize: getColumnWidth(activePage, col)
            })
          }
          onRowResizeStart={(row, pointerY) =>
            setResizeIntent({
              kind: "row",
              index: row,
              indexes: getResizeTargetRows(activePage, selection, row),
              startPointer: pointerY,
              startSize: getRowHeight(activePage, row)
            })
          }
          onColumnAutoFit={autoFitColumnsFromSelection}
          onRowAutoFit={autoFitRowsFromSelection}
          onCellPointerDown={handleCellPointerDown}
          onCellPointerEnter={handleCellPointerEnter}
          onCellDoubleClick={beginCellEdit}
          onCellClick={handleCellClick}
          onEditingValueChange={setEditingValue}
          onCommitCellEdit={commitCellEdit}
          onCancelCellEdit={cancelCellEdit}
          onEditFeed={openFeedHubForFeed}
          onRefreshFeed={(feedId) => void refreshFeeds(activePage.id, feedId)}
          onFragmentFeed={openFragmentDialog}
          onRemoveFragment={removeFragmentTarget}
          onOpenFeedActiveFilters={setActiveFeedFiltersTargetId}
          onChangeFeedPage={(targetId, page) => {
            updateFeedTargetQuery(targetId, (query) => normalizeFeedQuery({ ...query, page }));
          }}
          onMoveFeedTarget={handleMoveFeedTarget}
          onToggleFeedColumnSort={handleToggleFeedColumnSort}
          onOpenFeedColumnFilter={openFeedColumnFilter}
        />
      </section>

      {pendingAreaResize && activeAreaResizePlan ? (
        <div className="sheet-focus-overlay" data-testid="playground-area-resize-overlay">
          <div className="sheet-focus-dialog playground-area-resize-dialog" role="dialog" aria-modal="true" data-testid="playground-area-resize-dialog">
            <div className="sheet-focus-dialog-head">
              <div>
                <strong>Ajuste vertical da area</strong>
                <p>
                  {pendingAreaResize.label}: {pendingAreaResize.previousRows} para {pendingAreaResize.nextRows} linhas.
                </p>
              </div>
              <button type="button" className="sheet-filter-clear-btn" onClick={dismissPendingAreaResize}>
                Ignorar
              </button>
            </div>
            <div className="sheet-focus-dialog-body">
              <div className="playground-area-resize-summary">
                <span>{activeAreaResizePlan.deltaRows > 0 ? "Expansao" : "Contracao"}</span>
                <strong>{activeAreaResizePlan.deltaRows > 0 ? "+" : ""}{activeAreaResizePlan.deltaRows} linhas</strong>
                <small>
                  Colunas {columnLabel(activeAreaResizePlan.affectedColumns.startCol)}:{columnLabel(activeAreaResizePlan.affectedColumns.endCol)}
                </small>
              </div>
              <div className="playground-area-resize-mode">
                <button
                  type="button"
                  className={areaResizePreviewMode === "shift-range" ? "is-active" : ""}
                  onClick={() => setAreaResizePreviewMode("shift-range")}
                >
                  Deslocar faixa
                </button>
                <button
                  type="button"
                  className={areaResizePreviewMode === "fixed" ? "is-active" : ""}
                  onClick={() => setAreaResizePreviewMode("fixed")}
                >
                  Manter fixo
                </button>
              </div>
              {activeAreaResizePlan.conflicts.length > 0 ? (
                <div className="playground-area-resize-conflicts">
                  {activeAreaResizePlan.conflicts.map((conflict) => (
                    <p key={`${conflict.kind}-${conflict.areaIds.join("-")}`}>{conflict.message}</p>
                  ))}
                </div>
              ) : (
                <p className="playground-area-resize-note">
                  A faixa pontilhada mostra a area final. Estruturas fora das colunas afetadas permanecem no lugar.
                </p>
              )}
              <div className="sheet-filter-footer">
                <button type="button" className="sheet-filter-clear-btn" onClick={() => applyPendingAreaResize("fixed")}>
                  Aplicar fixo
                </button>
                <button
                  type="button"
                  className="sheet-filter-apply-btn"
                  onClick={() => applyPendingAreaResize(areaResizePreviewMode)}
                  disabled={!activeAreaResizePlan.safeToApply}
                >
                  Aplicar preview
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {printDialog && printablePage ? (
        <div className="sheet-focus-overlay" data-testid="playground-print-overlay">
          <div className="sheet-focus-dialog playground-print-dialog" role="dialog" aria-modal="true" data-testid="playground-print-dialog">
            <form
              className="sheet-dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitPrintDialog();
              }}
            >
              <div className="sheet-focus-dialog-head">
                <div>
                  <strong>Configurar impressao</strong>
                  <p>Revise o intervalo, os marcadores visuais e o preview antes de imprimir.</p>
                </div>
                <button type="button" className="sheet-filter-clear-btn" onClick={() => setPrintDialog(null)} data-testid="playground-print-close">
                  Fechar
                </button>
              </div>

              <div className="sheet-focus-dialog-body">
                <div className="sheet-dialog-grid">
                  <label className="sheet-form-field">
                    <span>Titulo</span>
                    <input
                      type="text"
                      value={printDialog.title}
                      data-testid="playground-print-title"
                      onChange={(event) =>
                        setPrintDialog((current) =>
                          current
                            ? {
                                ...current,
                                title: event.target.value
                              }
                            : current
                        )
                      }
                    />
                  </label>
                  <label className="sheet-form-field">
                    <span>Escopo</span>
                    <select
                      value={printDialog.scope}
                      data-testid="playground-print-scope"
                      onChange={(event) =>
                        setPrintDialog((current) =>
                          current
                            ? {
                                ...current,
                                scope: event.target.value as PlaygroundPrintScope
                              }
                            : current
                        )
                      }
                    >
                      <option value="page">Pagina usada</option>
                      <option value="selection" disabled={!printDialog.selectionRange}>
                        Selecao
                      </option>
                    </select>
                  </label>
                  <div className="playground-toolbar-chip playground-toolbar-chip-soft">
                    <span>Intervalo</span>
                    <strong>{printDialogRange ? formatSelectionAddress(printDialogRange) : "Vazio"}</strong>
                  </div>
                </div>

                <section className="sheet-dialog-section playground-print-options">
                  <label className="sheet-dialog-checkbox">
                    <input
                      type="checkbox"
                      checked={printDialog.showGridLines}
                      data-testid="playground-print-grid-lines"
                      onChange={(event) =>
                        setPrintDialog((current) =>
                          current
                            ? {
                                ...current,
                                showGridLines: event.target.checked
                              }
                            : current
                        )
                      }
                    />
                    <span>Linhas de grade</span>
                  </label>
                  <label className="sheet-dialog-checkbox">
                    <input
                      type="checkbox"
                      checked={printDialog.showSheetIndexes}
                      data-testid="playground-print-sheet-indexes"
                      onChange={(event) =>
                        setPrintDialog((current) =>
                          current
                            ? {
                                ...current,
                                showSheetIndexes: event.target.checked
                              }
                            : current
                        )
                      }
                    />
                    <span>Indices da planilha</span>
                  </label>
                </section>

                <section className="sheet-dialog-section">
                  <div className="sheet-dialog-section-head">
                    <div>
                      <strong>Preview</strong>
                      <span>
                        {printPreviewRowIndexes.length} linha(s) x {printPreviewColumnIndexes.length} coluna(s)
                      </span>
                    </div>
                  </div>
                  <div
                    className={`playground-print-preview ${printDialog.showGridLines ? "" : "is-grid-lines-hidden"}`.trim()}
                    data-testid="playground-print-preview"
                  >
                    {printPreviewRowIndexes.length === 0 || printPreviewColumnIndexes.length === 0 ? (
                      <p className="playground-empty-copy">Nao ha celulas visiveis neste intervalo.</p>
                    ) : (
                      <table>
                        <colgroup>
                          {printDialog.showSheetIndexes ? <col style={{ width: 52 }} /> : null}
                          {printPreviewColumnIndexes.map((col) => (
                            <col
                              key={`preview-col-${col}`}
                              style={{ width: Math.max(40, getColumnWidth(printablePage, col)) }}
                            />
                          ))}
                        </colgroup>
                        {printDialog.showSheetIndexes ? (
                          <thead>
                            <tr>
                              <th></th>
                              {printPreviewColumnIndexes.map((col) => (
                                <th key={`preview-head-${col}`}>{columnLabel(col)}</th>
                              ))}
                            </tr>
                          </thead>
                        ) : null}
                        <tbody>
                          {printPreviewRowIndexes.map((row) => (
                            <tr key={`preview-row-${row}`} style={{ height: getRowHeight(printablePage, row) }}>
                              {printDialog.showSheetIndexes ? <th>{row + 1}</th> : null}
                              {printPreviewColumnIndexes.map((col) => {
                                const cell = getCell(printablePage, row, col);

                                return (
                                  <td
                                    key={`preview-cell-${row}-${col}`}
                                    style={{
                                      backgroundColor: cell.style?.background,
                                      color: cell.style?.color,
                                      fontWeight: cell.style?.bold ? 700 : undefined
                                    }}
                                  >
                                    {cell.value || " "}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <div className="sheet-dialog-actions">
                  <button type="button" className="sheet-form-secondary" onClick={() => setPrintDialog(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="sheet-form-submit" data-testid="playground-print-submit">
                    Imprimir
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {feedFilterPopover ? (
        <div
          className="sheet-filter-popover playground-feed-filter-popover"
          data-testid={`playground-feed-filter-popover-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
          style={{
            position: "fixed",
            top: feedFilterPopover.top,
            left: feedFilterPopover.left,
            maxHeight: feedFilterPopover.maxHeight
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-filter-popover-head">
            <strong>{feedFilterPopover.label}</strong>
            <div className="sheet-filter-popover-actions">
              {activeFeedFilterRelation ? (
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`playground-feed-relation-expand-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
                  onClick={openFeedRelationDialogFromFilter}
                >
                  Expandir PK
                </button>
              ) : null}
              <button type="button" className="sheet-filter-clear-btn" onClick={closeFeedFilterPopover}>
                Fechar
              </button>
            </div>
          </div>
          <input
            className="sheet-filter-search"
            placeholder="Buscar valor..."
            value={feedFilterSearch}
            data-testid={`playground-feed-filter-search-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
            onChange={(event) => setFeedFilterSearch(event.target.value)}
          />
          <div className="sheet-filter-bulk-actions">
            <button
              type="button"
              className="sheet-filter-clear-btn"
              data-testid={`playground-feed-filter-select-all-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={() =>
                setFeedFilterDraftValues((current) => {
                  const next = new Set(current);
                  for (const option of activeFeedFilterOptions) {
                    next.add(option.literal);
                  }
                  return Array.from(next);
                })
              }
            >
              Selecionar tudo
            </button>
            <button
              type="button"
              className="sheet-filter-clear-btn"
              data-testid={`playground-feed-filter-clear-selection-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={() =>
                setFeedFilterDraftValues((current) => {
                  const blocked = new Set(activeFeedFilterOptions.map((option) => option.literal));
                  return current.filter((value) => !blocked.has(value));
                })
              }
            >
              Desmarcar tudo
            </button>
          </div>
          <div className="sheet-filter-options">
            {feedFilterLoading ? (
              <p>Carregando valores...</p>
            ) : activeFeedFilterOptions.length === 0 ? (
              <p>Sem valores para este filtro.</p>
            ) : (
              activeFeedFilterOptions.map((option) => {
                const checked = feedFilterDraftValues.includes(option.literal);

                return (
                  <label key={option.literal} className="sheet-filter-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      data-testid={`playground-feed-filter-option-${feedFilterPopover.targetId}-${feedFilterPopover.column}-${toTestIdFragment(option.literal)}`}
                      onChange={() => toggleFeedFilterDraftValue(option.literal)}
                    />
                    <span title={option.label}>
                      {option.literal === EMPTY_FILTER_LITERAL ? toFilterSelectionLabel(option.literal) : option.label} <em>({option.count})</em>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="sheet-filter-footer">
            <button
              type="button"
              className="sheet-filter-clear-btn"
              data-testid={`playground-feed-filter-clear-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={clearFeedFilter}
            >
              Limpar
            </button>
            <button
              type="button"
              className="sheet-filter-apply-btn"
              data-testid={`playground-feed-filter-apply-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={applyFeedFilter}
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
      <HolisticChooserDialog
        open={Boolean(feedRelationDialog)}
        overlayTestId="playground-feed-relation-dialog-overlay"
        dialogTestId="playground-feed-relation-dialog"
        title={feedRelationDialog ? `Expandir PK/FK: ${feedRelationDialog.sourceColumn}` : "Expandir PK/FK"}
        subtitle={feedRelationDialog ? `Tabela de origem: ${feedRelationDialog.targetTable}` : undefined}
        options={
          feedRelationDialog && feedRelationDialogPayload
            ? feedRelationDialogPayload.header.map((columnName) => ({
                key: columnName,
                label: columnName,
                testId: `playground-feed-relation-option-${feedRelationDialog.targetId}-${feedRelationDialog.sourceColumn}-${columnName}`
              }))
            : []
        }
        loading={feedRelationDialogLoading && !feedRelationDialogPayload}
        emptyMessage="Sem dados para expandir."
        closeTestId="playground-feed-relation-dialog-close"
        onClose={() => setFeedRelationDialog(null)}
        actionMap={{
          default: async (key) => {
            selectFeedRelationDisplayColumn(key);
          }
        }}
      />
      <HolisticChooserDialog
        open={Boolean(activeFeedFiltersTarget)}
        overlayTestId="playground-active-filters-dialog-overlay"
        dialogTestId="playground-active-filters-dialog"
        title="Filtros ativos"
        subtitle={activeFeedFiltersTarget ? `${activeFeedFiltersTarget.title ?? tableLabelByKey[activeFeedFiltersTarget.table] ?? activeFeedFiltersTarget.table}` : undefined}
        options={activeFeedFiltersDialogOptions}
        emptyMessage="Nenhum filtro ativo nesta area."
        closeTestId="playground-active-filters-dialog-close"
        compact
        onClose={() => setActiveFeedFiltersTargetId(null)}
        actionMap={{
          default: async (column) => {
            if (activeFeedFiltersTarget) {
              clearFeedTargetFilter(activeFeedFiltersTarget.id, column);
            }
          },
          cases: {
            __all__: async () => {
              if (activeFeedFiltersTarget) {
                clearFeedTargetUserFilters(activeFeedFiltersTarget.id);
              }
            }
          }
        }}
      />

      {fragmentDialog && activeFragmentFeed ? (
        <div
          className="sheet-focus-overlay playground-fragment-overlay"
          data-testid="playground-fragment-overlay"
          style={{ zIndex: 1400 }}
        >
          <div className="sheet-focus-dialog playground-fragment-dialog" role="dialog" aria-modal="true" data-testid="playground-fragment-dialog">
            <div className="sheet-focus-dialog-head">
              <div>
                <strong>Fragmentar alimentador</strong>
                <p>Crie areas filhas por valor. O pai passa a exibir somente os valores nao fragmentados.</p>
              </div>
              <button type="button" className="sheet-filter-clear-btn" onClick={() => setFragmentDialog(null)}>
                Fechar
              </button>
            </div>
            <div className="sheet-focus-dialog-body">
              <section className="sheet-dialog-section playground-fragment-picker">
                <label>
                  <span>Coluna</span>
                  <select
                    value={fragmentDialog.sourceColumn}
                    data-testid={`playground-fragment-column-${fragmentDialog.feedId}`}
                    onChange={(event) => changeFragmentSourceColumn(event.target.value)}
                  >
                    {activeFragmentFeed.columns.map((column) => (
                      <option key={column} value={column}>
                        {activeFragmentFeed.columnLabels[column] ?? column}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Buscar</span>
                  <input
                    value={fragmentDialog.search}
                    placeholder="Valor..."
                    data-testid={`playground-fragment-search-${fragmentDialog.feedId}`}
                    onChange={(event) =>
                      setFragmentDialog((current) =>
                        current
                          ? {
                              ...current,
                              search: event.target.value
                            }
                          : current
                      )
                    }
                  />
                </label>
              </section>

              <section className="sheet-dialog-section playground-fragment-grouping">
                <label className="sheet-dialog-checkbox">
                  <input
                    type="checkbox"
                    checked={fragmentDialog.groupSelected}
                    data-testid={`playground-fragment-group-toggle-${fragmentDialog.feedId}`}
                    onChange={(event) =>
                      setFragmentDialog((current) =>
                        current
                          ? {
                              ...current,
                              groupSelected: event.target.checked
                            }
                          : current
                      )
                    }
                  />
                  <span>
                    Agrupar os valores selecionados em um unico fragmento
                    <em style={{ display: "block", color: "#657893", fontStyle: "normal", fontSize: "0.78rem" }}>
                      Marque para criar uma area unica contendo todas as ocorrencias dos filtros selecionados.
                    </em>
                  </span>
                </label>
                {fragmentDialog.groupSelected ? (
                  <label className="sheet-form-field" style={{ marginTop: 8 }}>
                    <span>Rotulo do fragmento agrupado (opcional)</span>
                    <input
                      type="text"
                      value={fragmentDialog.groupLabel}
                      placeholder="Ex.: Selecionados"
                      data-testid={`playground-fragment-group-label-${fragmentDialog.feedId}`}
                      onChange={(event) =>
                        setFragmentDialog((current) =>
                          current
                            ? {
                                ...current,
                                groupLabel: event.target.value
                              }
                            : current
                        )
                      }
                    />
                  </label>
                ) : null}
              </section>

              <div className="sheet-filter-bulk-actions">
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  onClick={() =>
                    setFragmentDialog((current) =>
                      current
                        ? {
                            ...current,
                            selectedLiterals: Array.from(new Set([...current.selectedLiterals, ...activeFragmentOptions.map((option) => option.literal)]))
                          }
                        : current
                    )
                  }
                >
                  Selecionar visiveis
                </button>
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  onClick={() =>
                    setFragmentDialog((current) =>
                      current
                        ? {
                            ...current,
                            selectedLiterals: current.selectedLiterals.filter(
                              (literal) => !activeFragmentOptions.some((option) => option.literal === literal)
                            )
                          }
                        : current
                    )
                  }
                >
                  Desmarcar visiveis
                </button>
              </div>

              <div className="playground-fragment-options">
                {fragmentDialog.loading ? (
                  <p>Carregando valores...</p>
                ) : activeFragmentOptions.length === 0 ? (
                  <p>Sem valores disponiveis para fragmentar nesta coluna.</p>
                ) : (
                  activeFragmentOptions.map((option) => {
                    const checked = fragmentDialog.selectedLiterals.includes(option.literal);

                    return (
                      <label key={option.literal} className="sheet-filter-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          data-testid={`playground-fragment-option-${fragmentDialog.feedId}-${fragmentDialog.sourceColumn}-${toTestIdFragment(option.literal)}`}
                          onChange={() => toggleFragmentLiteral(option.literal)}
                        />
                        <span title={option.label}>
                          {option.literal === EMPTY_FILTER_LITERAL ? toFilterSelectionLabel(option.literal) : option.label} <em>({option.count})</em>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="sheet-filter-footer">
                <button type="button" className="sheet-filter-clear-btn" onClick={() => setFragmentDialog(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="sheet-filter-apply-btn"
                  data-testid={`playground-fragment-apply-${fragmentDialog.feedId}`}
                  onClick={applyFragmentDialog}
                  disabled={fragmentDialog.selectedLiterals.length === 0}
                >
                  {fragmentDialog.groupSelected ? "Criar fragmento agrupado" : "Criar fragmentos"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {feedDialogOpen ? (
        <div className="sheet-focus-overlay" data-testid="playground-feed-overlay">
          <div className="sheet-focus-dialog playground-feed-hub-dialog" role="dialog" aria-modal="true" data-testid="playground-feed-dialog">
            <div className="sheet-focus-dialog-head">
              <div>
                <strong>Hub de alimentadores</strong>
                <p>Gerencie areas, fragmentos, colunas, filtros e atualizacoes da pagina atual.</p>
              </div>
              <button type="button" className="sheet-filter-clear-btn" onClick={closeFeedDialog}>
                Fechar
              </button>
            </div>

            <div className="sheet-focus-dialog-body">
              <div className="playground-feed-hub">
                <aside className="playground-feed-hub-sidebar">
                  <div className="sheet-dialog-section-head">
                    <div>
                      <strong>Areas</strong>
                      <span>{activePage.feeds.length} alimentador(es)</span>
                    </div>
                    <div className="sheet-dialog-section-actions">
                      <button type="button" className="sheet-filter-clear-btn" onClick={startNewFeed} disabled={feedTableOptions.length === 0}>
                        Novo
                      </button>
                      <button type="button" className="sheet-filter-clear-btn" onClick={() => void refreshFeeds(activePage.id)} disabled={activePage.feeds.length === 0}>
                        Atualizar
                      </button>
                    </div>
                  </div>

                  {activePage.feeds.length === 0 ? (
                    <p className="playground-empty-copy">Nenhum alimentador nesta pagina.</p>
                  ) : (
                    <div className="playground-feed-hub-list">
                      {activePage.feeds.map((feed) => {
                        const feedData = feedDataByTargetId[feed.id];
                        const target = feedDataTargets.find((item) => item.id === feed.id);
                        const filterCount = target ? getUserFilterEntries(target).length : 0;

                        return (
                          <button
                            key={feed.id}
                            type="button"
                            className={`playground-feed-hub-card ${feedHubSelectedId === feed.id ? "is-active" : ""}`.trim()}
                            data-testid={`playground-feed-hub-card-${feed.id}`}
                            onClick={() => selectHubFeed(feed)}
                          >
                            <strong>{feed.title?.trim() || tableLabelByKey[feed.table] || feed.table}</strong>
                            <span>{formatFeedSummary(feed, tableLabelByKey[feed.table])}</span>
                            <small>
                              {feedData?.status === "ready"
                                ? `${feedData.rows.length}/${feedData.totalRows} linhas`
                                : feedData?.status === "loading"
                                  ? "Sincronizando"
                                  : feedData?.status === "error"
                                    ? "Erro no cache"
                                    : formatRenderedAt(feed.renderedAt)}
                            </small>
                            <em>
                              {feed.fragments.length} frag. {filterCount > 0 ? `- ${filterCount} filtro(s)` : ""}
                            </em>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </aside>

                <section className="playground-feed-hub-detail">
                  {feedTableOptions.length === 0 ? (
                    <p className="playground-empty-copy">Seu perfil nao possui tabelas disponiveis para novos alimentadores.</p>
                  ) : (
                    <div className="playground-feed-hub-panel">
                      <div className="sheet-dialog-section-head">
                        <div>
                          <strong>{currentEditingFeed ? "Configurar alimentador" : "Novo alimentador"}</strong>
                          <span>Renomeie, altere tabela, colunas, destino e fragmentos.</span>
                        </div>
                        {currentEditingFeed ? (
                          <div className="sheet-dialog-section-actions">
                            <button type="button" className="sheet-filter-clear-btn" onClick={() => openFragmentDialog(currentEditingFeed.id)}>
                              Fragmentar
                            </button>
                            <button type="button" className="sheet-filter-clear-btn" onClick={() => void refreshFeeds(activePage.id, currentEditingFeed.id)}>
                              Atualizar
                            </button>
                            <button type="button" className="sheet-filter-clear-btn" onClick={() => removeFeed(currentEditingFeed)}>
                              Remover
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="sheet-dialog-grid">
                        <label className="sheet-form-field">
                          <span>Nome</span>
                          <input
                            type="text"
                            value={feedTitle}
                            placeholder={feedTable ? tableLabelByKey[feedTable] ?? feedTable : "Nome do alimentador"}
                            data-testid="playground-feed-title-input"
                            onChange={(event) => setFeedTitle(event.target.value)}
                          />
                        </label>
                        <label className="sheet-form-field">
                          <span>Tabela</span>
                          <select value={feedTable} onChange={(event) => handleFeedTableChange(event.target.value as SheetKey)}>
                            {feedTableOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="playground-toolbar-chip playground-toolbar-chip-soft">
                          <span>Destino</span>
                          <strong>{currentEditingFeed ? formatCellAddress(currentEditingFeed.targetRow, currentEditingFeed.targetCol) : "Escolha ao salvar"}</strong>
                        </div>
                      </div>

                      <section className="sheet-dialog-section playground-feed-hub-subsection playground-feed-render-section">
                        <div className="sheet-dialog-section-head">
                          <div>
                            <strong>Renderizacao</strong>
                            <span>Controle o volume de linhas e os comandos que aparecem no header do alimentador.</span>
                          </div>
                        </div>
                        <div className="playground-feed-render-grid">
                          <label className="sheet-form-field">
                            <span>Linhas renderizadas</span>
                            <input
                              type="number"
                              min={1}
                              max={200}
                              step={1}
                              value={feedPageSize}
                              data-testid="playground-feed-page-size-input"
                              onChange={(event) => setFeedPageSize(event.target.value)}
                            />
                          </label>
                          <label className="sheet-dialog-checkbox playground-feed-render-toggle">
                            <input
                              type="checkbox"
                              checked={feedShowPaginationInHeader}
                              data-testid="playground-feed-header-pagination-toggle"
                              onChange={(event) => setFeedShowPaginationInHeader(event.target.checked)}
                            />
                            <span>Paginar no header</span>
                          </label>
                          <div className="playground-feed-render-preview" aria-hidden="true">
                            <button type="button" tabIndex={-1}>{"<"}</button>
                            <span>1/4</span>
                            <button type="button" tabIndex={-1}>{">"}</button>
                          </div>
                        </div>
                      </section>

                      <section className="sheet-dialog-section playground-feed-hub-subsection">
                        <div className="sheet-dialog-section-head">
                          <div>
                            <strong>Filtros fixos</strong>
                            <span>Fixe filtros ativos como parte da definicao do alimentador.</span>
                          </div>
                        </div>

                        {!currentEditingFeed ? (
                          <p className="playground-empty-copy">
                            Salve este alimentador para fixar filtros. Apos salvar, aplique um filtro pelo cabecalho da coluna e marque-o como ancora aqui.
                          </p>
                        ) : currentEditingFeedFilterEntries.length === 0 ? (
                          <p className="playground-empty-copy">
                            Nenhum filtro ativo neste alimentador. Aplique um filtro pelo cabecalho da coluna no grid para que ele apareca aqui.
                          </p>
                        ) : (
                          <div className="sheet-order-list">
                            {currentEditingFeedFilterEntries.map(([column, expression]) => {
                              const label = currentEditingFeed.columnLabels[column] ?? column;

                              return (
                                <div key={`feed-anchor-filter-${currentEditingFeed.id}-${column}`} className="sheet-order-item">
                                  <div className="sheet-print-column-main">
                                    <label className="sheet-dialog-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={feedAnchorFilterColumnSet.has(column)}
                                        data-testid={`playground-anchor-filter-toggle-${currentEditingFeed.id}-${column}`}
                                        onChange={() => toggleFeedAnchorFilterColumn(column)}
                                      />
                                      <span>{label}</span>
                                    </label>
                                    <div className="sheet-print-column-meta">
                                      <span>{describeFeedFilterExpression(expression)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      <section className="sheet-dialog-section playground-feed-hub-subsection">
                        <div className="sheet-dialog-section-head">
                          <div>
                            <strong>Colunas</strong>
                            <span>Ative as colunas, renomeie o cabecalho do alimentador e ajuste a ordem.</span>
                          </div>
                          <div className="sheet-dialog-section-actions">
                            <button
                              type="button"
                              className="sheet-filter-clear-btn"
                              onClick={() => {
                                setFeedColumns(activeColumns);
                                setFeedColumnLabels((current) =>
                                  activeColumns.reduce<Record<string, string>>((acc, column) => {
                                    acc[column] = current[column] ?? column;
                                    return acc;
                                  }, {})
                                );
                              }}
                              disabled={activeColumns.length === 0}
                            >
                              Selecionar tudo
                            </button>
                            <button type="button" className="sheet-filter-clear-btn" onClick={() => setFeedColumns([])}>
                              Desselecionar
                            </button>
                          </div>
                        </div>

                        {loadingColumnsFor === feedTable ? (
                          <p className="playground-empty-copy">Carregando colunas...</p>
                        ) : orderedDialogColumns.length > 0 ? (
                          <div className="sheet-order-list">
                            {orderedDialogColumns.map((column) => {
                              const enabled = feedColumns.includes(column);
                              const customLabel = feedColumnLabels[column] ?? column;

                              return (
                                <div key={`feed-column-${column}`} className="sheet-order-item">
                                  <div className="sheet-print-column-main">
                                    <label className="sheet-dialog-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={() => toggleFeedColumn(column)}
                                      />
                                      <span>{column}</span>
                                    </label>
                                    <label className="sheet-form-field sheet-print-column-label-field">
                                      <span>Nome na planilha</span>
                                      <input
                                        type="text"
                                        value={customLabel}
                                        onChange={(event) => updateFeedColumnLabel(column, event.target.value)}
                                      />
                                    </label>
                                    <div className="sheet-print-column-meta">
                                      <span>{enabled ? "Ativa" : "Desativada"}</span>
                                      {customLabel.trim() && customLabel.trim() !== column ? <span>Alias personalizado</span> : null}
                                    </div>
                                  </div>
                                  <div className="sheet-order-actions">
                                    <button
                                      type="button"
                                      className="sheet-order-btn"
                                      disabled={!enabled}
                                      onClick={() => moveFeedColumn(column, "up")}
                                    >
                                      ^
                                    </button>
                                    <button
                                      type="button"
                                      className="sheet-order-btn"
                                      disabled={!enabled}
                                      onClick={() => moveFeedColumn(column, "down")}
                                    >
                                      v
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="playground-empty-copy">Nenhuma coluna disponivel para a tabela selecionada.</p>
                        )}
                      </section>

                      {activeHubFeed ? (
                        <section className="sheet-dialog-section playground-feed-hub-subsection">
                          <div className="sheet-dialog-section-head">
                            <div>
                              <strong>Fragmentos</strong>
                              <span>Selecione um fragmento para renomear e controlar suas colunas.</span>
                            </div>
                          </div>

                          {activeHubFeed.fragments.length === 0 ? (
                            <p className="playground-empty-copy">Este alimentador ainda nao possui fragmentos.</p>
                          ) : (
                            <div className="playground-feed-fragment-hub">
                              <div className="playground-feed-fragment-list">
                                {activeHubFeed.fragments.map((fragment) => (
                                  <button
                                    key={fragment.id}
                                    type="button"
                                    className={feedHubFragmentId === fragment.id ? "is-active" : ""}
                                    data-testid={`playground-feed-hub-fragment-${fragment.id}`}
                                    onClick={() => setFeedHubFragmentId(fragment.id)}
                                  >
                                    <strong>{fragment.valueLabel}</strong>
                                    <span>{activeHubFeed.columnLabels[fragment.sourceColumn] ?? fragment.sourceColumn}</span>
                                  </button>
                                ))}
                              </div>

                              {activeHubFragment ? (
                                <div className="playground-feed-fragment-detail">
                                  <label className="sheet-form-field">
                                    <span>Nome do fragmento</span>
                                    <input
                                      type="text"
                                      value={activeHubFragment.valueLabel}
                                      data-testid={`playground-feed-fragment-title-${activeHubFragment.id}`}
                                      onChange={(event) => updateHubFragmentLabel(event.target.value)}
                                    />
                                  </label>

                                  <div className="sheet-order-list">
                                    {[...activeHubFragmentColumns, ...activeHubFeed.columns.filter((column) => !activeHubFragmentColumns.includes(column))].map((column) => {
                                      const enabled = activeHubFragmentColumns.includes(column);
                                      const customLabel = activeHubFragmentLabels[column] ?? activeHubFeed.columnLabels[column] ?? column;
                                      const relation = RELATION_BY_SHEET_COLUMN[activeHubFeed.table]?.[column];
                                      const ownDisplayOverride = activeHubFragment.displayColumnOverrides[column];
                                      const inheritedDisplayOverride = activeHubFeed.displayColumnOverrides[column];
                                      const effectiveDisplayOverride = ownDisplayOverride ?? inheritedDisplayOverride;

                                      return (
                                        <div key={`fragment-column-${activeHubFragment.id}-${column}`} className="sheet-order-item">
                                          <div className="sheet-print-column-main">
                                            <label className="sheet-dialog-checkbox">
                                              <input
                                                type="checkbox"
                                                checked={enabled}
                                                data-testid={`playground-feed-fragment-column-toggle-${activeHubFragment.id}-${column}`}
                                                onChange={() => toggleHubFragmentColumn(column)}
                                              />
                                              <span>{column}</span>
                                            </label>
                                            <label className="sheet-form-field sheet-print-column-label-field">
                                              <span>Nome no fragmento</span>
                                              <input
                                                type="text"
                                                value={customLabel}
                                                disabled={!enabled}
                                                data-testid={`playground-feed-fragment-column-label-${activeHubFragment.id}-${column}`}
                                                onChange={(event) => updateHubFragmentColumnLabel(column, event.target.value)}
                                              />
                                            </label>
                                            <div className="sheet-print-column-meta">
                                              <span>{enabled ? "Ativa" : "Desativada"}</span>
                                              {effectiveDisplayOverride ? (
                                                <span>
                                                  FK: {effectiveDisplayOverride}
                                                  {ownDisplayOverride ? "" : " herdada"}
                                                </span>
                                              ) : relation ? (
                                                <span>FK disponivel</span>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="sheet-order-actions">
                                            {relation ? (
                                              <button
                                                type="button"
                                                className="sheet-filter-clear-btn"
                                                disabled={!enabled}
                                                data-testid={`playground-feed-fragment-relation-expand-${activeHubFragment.id}-${column}`}
                                                onClick={() => openHubFragmentRelationDialog(column)}
                                              >
                                                Expandir FK
                                              </button>
                                            ) : null}
                                            {ownDisplayOverride ? (
                                              <button
                                                type="button"
                                                className="sheet-filter-clear-btn"
                                                data-testid={`playground-feed-fragment-relation-clear-${activeHubFragment.id}-${column}`}
                                                onClick={() => clearFeedTargetDisplayOverride(activeHubFragment.id, column)}
                                              >
                                                Herdar FK
                                              </button>
                                            ) : null}
                                            <button
                                              type="button"
                                              className="sheet-order-btn"
                                              disabled={!enabled}
                                              onClick={() => moveHubFragmentColumn(column, "up")}
                                            >
                                              ^
                                            </button>
                                            <button
                                              type="button"
                                              className="sheet-order-btn"
                                              disabled={!enabled}
                                              onClick={() => moveHubFragmentColumn(column, "down")}
                                            >
                                              v
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="playground-empty-copy">Clique em um fragmento para editar suas colunas.</p>
                              )}
                            </div>
                          )}
                        </section>
                      ) : null}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <footer className="sheet-dialog-actions">
              <button type="button" className="sheet-form-secondary" onClick={closeFeedDialog}>
                Fechar
              </button>
              {feedTableOptions.length > 0 ? (
                currentEditingFeed ? (
                  <>
                    <button type="button" className="sheet-form-secondary" onClick={() => void saveFeedOnCurrentTarget()}>
                      Salvar aqui
                    </button>
                    <button type="button" className="sheet-form-submit" onClick={startTargetSelectionForFeed}>
                      Salvar e escolher destino
                    </button>
                  </>
                ) : (
                  <button type="button" className="sheet-form-submit" onClick={startTargetSelectionForFeed}>
                    Escolher destino
                  </button>
                )
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
