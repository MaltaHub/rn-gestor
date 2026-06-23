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
  buildRelationDisplayLookup,
  EMPTY_FILTER_LITERAL,
  RELATION_BY_SHEET_COLUMN,
  resolveDisplayValueFromLookup,
  toFilterSelectionLabel
} from "@/components/ui-grid/core/grid-rules";
import { HolisticChooserDialog, type HolisticChooserOption } from "@/components/ui-grid/sheet-chrome";
import type { CurrentActor, GridListPayload, RequestAuth, Role, SheetKey } from "@/components/ui-grid/types";
import { PlaygroundGridCanvas } from "@/components/playground/playground-grid-canvas";
import {
  buildParentFeedDataTarget,
  buildPlaygroundFeedRequestKey,
  formatPlaygroundFeedValue,
  type PlaygroundFeedDataRecord,
  type PlaygroundFeedDataTarget
} from "@/components/playground/domain/feed-data";
import { normalizeCellStyle, setColumnStyle } from "@/components/playground/domain/cell-style";
import { isFormula, type FormulaScalar } from "@/components/playground/domain/formula/engine";
import { evaluateSheetFormulas, formatFormulaResult } from "@/components/playground/domain/formula/sheet";
import { currentFormulaToken, suggestFormulaFunctions } from "@/components/playground/domain/formula/help";
import {
  getFeedTargetGridSize,
  moveFeedTargetInPage,
  resolveFeedOverlapsInPage
} from "@/components/playground/domain/feed-placement";
import { findNearestAvailableGridPosition } from "@/components/playground/domain/collision";
import { detectPlaygroundProblems, type PlaygroundProblem } from "@/components/playground/domain/grid-problems";
import {
  describeFilterNode,
  filterRelation,
  normalizeFilterNode,
  type FilterNode
} from "@/components/ui-grid/core/filter-predicate";
import { RelationWhereBuilder } from "@/components/playground/relation-where-builder";
import {
  applyAreaResizePlan,
  calculateAreaResizePlan,
  type AreaResizeMode,
  type AreaResizePlan,
  type PlaygroundArea
} from "@/components/playground/domain/playground-area";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  buildExcludedValuesExpression,
  buildFeedFilterExpressionFromSelection,
  buildGroupedFragmentValueLiteral,
  normalizeAnchorFilterColumns,
  normalizeFeedQuery,
  parseFeedFilterSelection,
  toggleFeedSort,
  withFeedFilter,
  withFeedFilterSelection
} from "@/components/playground/domain/feed-query";
import {
  createFeedFragments,
  createGroupedFeedFragment,
  updateFeedFragmentLiterals,
  createRowSliceFragment,
  getEffectiveFragmentLiterals,
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
  getPrintBodyHeight,
  getRowHeight,
  hideColumns,
  hideRows,
  isColumnHidden,
  isRowHidden,
  normalizeSelection,
  packIntoPrintSlabs,
  paintSelection,
  PLAYGROUND_COLUMN_HEADER_HEIGHT,
  PLAYGROUND_MAX_COLS,
  PLAYGROUND_MAX_PAGES,
  PLAYGROUND_MAX_ROWS,
  PLAYGROUND_MIN_COLS,
  PLAYGROUND_MIN_ROWS,
  PLAYGROUND_PRINT_PAGE_WIDTH_PX,
  PLAYGROUND_ROW_HEADER_WIDTH,
  removeFeedFromPage,
  removeSelectionFill,
  resizeColumns,
  resizeRows,
  showAllColumns,
  showAllRows,
  trimPageSize,
  upsertFeedDefinitionInPage,
  updateCellValue
} from "@/components/playground/grid-utils";
import { PLAYGROUND_MAX_ZOOM, PLAYGROUND_MIN_ZOOM } from "@/components/playground/domain/workbook-model";
import { usePlaygroundFeedColumnLoader } from "@/components/playground/hooks/use-playground-feed-column-loader";
import { usePlaygroundFeedFormState } from "@/components/playground/hooks/use-playground-feed-form-state";
import { usePlaygroundFeedData } from "@/components/playground/hooks/use-playground-feed-data";
import { usePlaygroundPrint } from "@/components/playground/hooks/use-playground-print-dialog";
import { usePlaygroundStoredState } from "@/components/playground/hooks/use-playground-stored-state";
import { fetchPlaygroundColumnFacets, type PlaygroundFacetOption } from "@/components/playground/infra/playground-api";
import type {
  PendingFeedConfig,
  PlaygroundCell,
  PlaygroundCellStyle,
  PlaygroundFeed,
  PlaygroundFeedFragment,
  PlaygroundFeedQuery,
  PlaygroundMode,
  PlaygroundPage,
  PlaygroundProchColumn,
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
  /**
   * Quando setado, o dialog opera em modo EDICAO de um fragmento existente:
   * ajusta o conjunto de valores cobertos (add/remover) em vez de criar novos.
   */
  editFragmentId?: string | null;
  /** "value": fragmenta por valor de coluna; "rows": quebra em blocos de N linhas. */
  fragmentMode: "value" | "rows";
  /** Linhas por bloco no modo "rows". */
  rowsPerBlock: number;
  sourceColumn: string;
  selectedLiterals: string[];
  /**
   * "include": fragmenta os literais marcados (padrao).
   * "except": fragmenta todos os valores disponiveis EXCETO os marcados (que
   * passam a representar exclusoes). Util para fragmentar muitos valores
   * desmarcando poucos.
   */
  selectionMode: "include" | "except";
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

const PLAYGROUND_PRINT_STRIPE_BACKGROUND = "#eef1f6";

function buildPrintDocument(params: {
  page: PlaygroundPage;
  range: PlaygroundSelection;
  title: string;
  showGridLines: boolean;
  showSheetIndexes: boolean;
  stripedRows: boolean;
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

  // Zebra impressa segue a posicao visual da linha entre as visiveis (mesma
  // regra da tela), nao o indice absoluto, para nao "pular" cores em linhas ocultas.
  const rowOrdinalByIndex = new Map(rowIndexes.map((rowIndex, ordinal) => [rowIndex, ordinal]));

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
  const printableHeightForBody = getPrintBodyHeight({ showSheetIndexes: params.showSheetIndexes });
  const rowSlabs = packIntoPrintSlabs(
    rowIndexes,
    (row) => Math.max(18, getRowHeight(params.page, row)),
    printableHeightForBody
  );

  const safeColumnSlabs = columnSlabs.length > 0 ? columnSlabs : [columnIndexes];
  const safeRowSlabs = rowSlabs.length > 0 ? rowSlabs : [rowIndexes];

  const gridBorder = params.showGridLines ? "1px solid #cbd5e1" : "0";

  const cellHasContent = (row: number, col: number) => {
    const cellValue = getCell(params.page, row, col).value;
    return Boolean(cellValue && cellValue.trim().length > 0);
  };

  // O intervalo de impressao e a bounding box (min->max) das celulas com
  // conteudo; regioes vazias entre blocos distantes virariam folhas em branco.
  // Por isso so emitimos um (rowSlab x colSlab) que tenha ALGUM conteudo.
  const printableBlocks = safeRowSlabs.flatMap((rowSlab) =>
    safeColumnSlabs
      .filter((colSlab) => rowSlab.some((row) => colSlab.some((col) => cellHasContent(row, col))))
      .map((colSlab) => ({ rowSlab, colSlab }))
  );
  const safeBlocks =
    printableBlocks.length > 0 ? printableBlocks : [{ rowSlab: safeRowSlabs[0], colSlab: safeColumnSlabs[0] }];
  const totalPages = safeBlocks.length;

  const sectionMarkup: string[] = [];
  let pageIndex = 0;

  for (const { rowSlab, colSlab } of safeBlocks) {
    {
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
          // Setting `height` on the individual cells (in addition to the row)
          // forces the browser's print engine to honor the declared row size
          // instead of shrinking it to content height — this is what keeps the
          // dashed marker in the grid aligned with the rows that actually fit
          // on a printer sheet.
          const cellSizingStyle = `height:${rowHeight}px;`;
          const isStripedRow = params.stripedRows && ((rowOrdinalByIndex.get(row) ?? 0) % 2 === 1);
          const stripeBackground = isStripedRow ? PLAYGROUND_PRINT_STRIPE_BACKGROUND : null;
          const indexCellMarkup = params.showSheetIndexes
            ? `<th style="${cellSizingStyle}">${row + 1}</th>`
            : "";
          const cells = colSlab
            .map((col) => {
              const cell = getCell(params.page, row, col);
              // Zebra impressa so pinta celulas COM conteudo (igual a tela).
              const cellStripe = cell.value && cell.value.trim().length > 0 ? stripeBackground : null;
              const cellBackground = cell.style?.background ?? cellStripe;
              const cellStyleParts = [
                cellSizingStyle,
                cellBackground ? `background-color:${cellBackground} !important;` : "",
                cell.style?.color ? `color:${cell.style.color} !important;` : "",
                cell.style?.bold ? "font-weight:700;" : ""
              ];
              const cellStyle = cellStyleParts.filter(Boolean).join("");

              return `<td style="${cellStyle}">${escapeHtml(cell.value || " ")}</td>`;
            })
            .join("");

          return `<tr style="height:${rowHeight}px;page-break-inside:avoid;">${indexCellMarkup}${cells}</tr>`;
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
  // Fallback do Ctrl+C/Ctrl+V quando a Clipboard API do navegador estiver
  // indisponivel/bloqueada (ex.: contexto sem permissao). Guarda o ultimo TSV
  // copiado dentro da propria sessao do playground.
  const internalClipboardRef = useRef<string | null>(null);
  // Sempre aponta para o handler de teclado mais recente; usado pelo listener
  // global de window (sem re-assinar a cada render).
  const gridKeyHandlerRef = useRef<((event: ReactKeyboardEvent<HTMLDivElement> | KeyboardEvent) => void) | null>(null);

  const [selection, setSelection] = useState<PlaygroundSelection | null>(null);
  const [mode, setMode] = useState<PlaygroundMode>("edit");
  const [pendingFeedConfig, setPendingFeedConfig] = useState<PendingFeedConfig | null>(null);
  const [resizeIntent, setResizeIntent] = useState<ResizeIntent | null>(null);
  const [editingCell, setEditingCell] = useState<CellCoords | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  const [formulaValue, setFormulaValue] = useState("");
  // Sugestoes de funcoes da barra de formula (descoberta das operacoes dinamicas).
  const [formulaSuggestOpen, setFormulaSuggestOpen] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const [fillColor, setFillColor] = useState("#fff3a6");
  const [textColor, setTextColor] = useState("#1f2937");
  // Pincel de formatacao: estilo capturado da celula ativa para colar em outra.
  const [copiedStyle, setCopiedStyle] = useState<PlaygroundCellStyle | null>(null);
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
    feedHideColumnHeader,
    setFeedHideColumnHeader,
    feedAnchorFilterColumns,
    setFeedAnchorFilterColumns,
    feedFilterDrafts,
    setFeedFilterDrafts,
    feedProchColumns,
    setFeedProchColumns,
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
  // Filtro aninhado (cross-tabela) no popover de filtro do feed.
  const [nestedFilterOpen, setNestedFilterOpen] = useState(false);
  // Sub-predicado em construcao (arvore recursiva: coluna -> valor | aninhar mais fundo).
  const [nestedFilterDraft, setNestedFilterDraft] = useState<FilterNode | null>(null);
  // Modo de selecao do filtro do feed: incluir / todos exceto / matematico.
  const [feedFilterMode, setFeedFilterMode] = useState<"include" | "exclude" | "math">("include");
  const [feedFilterMathOp, setFeedFilterMathOp] = useState<">" | ">=" | "<" | "<=" | "!=">(">");
  const [feedFilterMathValue, setFeedFilterMathValue] = useState("");
  // Popover de acoes do alimentador no configurador (botao "+" -> Duplicar...).
  const [feedActionPopover, setFeedActionPopover] = useState<{ feedId: string; top: number; left: number } | null>(null);
  // #7: opcoes do filtro do dominio completo (ignora os filtros atuais do feed)
  // vs tempo-real (so o que sobra com os filtros aplicados).
  const [feedFilterFullDomain, setFeedFilterFullDomain] = useState(false);
  const [activeFeedFiltersTargetId, setActiveFeedFiltersTargetId] = useState<string | null>(null);
  const [configFilterPopover, setConfigFilterPopover] = useState<{
    column: string;
    label: string;
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const [configFilterDraftValues, setConfigFilterDraftValues] = useState<string[]>([]);
  const [configFilterSearch, setConfigFilterSearch] = useState("");
  const [configFilterOptions, setConfigFilterOptions] = useState<PlaygroundFacetOption[]>([]);
  const [configFilterLoading, setConfigFilterLoading] = useState(false);
  const [relationCache, setRelationCache] = useState<Partial<Record<SheetKey, GridListPayload>>>({});
  const [feedRelationDialog, setFeedRelationDialog] = useState<FeedRelationDialogState | null>(null);
  const [feedRelationDialogLoading, setFeedRelationDialogLoading] = useState(false);
  const [fragmentDialog, setFragmentDialog] = useState<FragmentDialogState | null>(null);
  const [pendingAreaResize, setPendingAreaResize] = useState<PendingAreaResize | null>(null);
  const [areaResizePreviewMode, setAreaResizePreviewMode] = useState<AreaResizeMode>("shift-range");
  // Bolinha de alerta: indice do problema atualmente focado na navegacao.
  const [activeProblemIndex, setActiveProblemIndex] = useState(0);
  // So evidencia o problema "focado" depois do primeiro clique na bolinha.
  const [problemNavStarted, setProblemNavStarted] = useState(false);

  const closeFeedFilterPopover = useCallback(() => {
    setFeedFilterPopover(null);
    setFeedFilterSearch("");
    setFeedFilterDraftValues([]);
    setFeedFilterOptions([]);
    setFeedFilterLoading(false);
    setNestedFilterOpen(false);
    setNestedFilterDraft(null);
    setFeedFilterMode("include");
    setFeedFilterMathOp(">");
    setFeedFilterMathValue("");
    setFeedFilterFullDomain(false);
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
      setFeedProchColumns([]);
      setFeedFilterDrafts({});
      closeFeedFilterPopover();
      setActiveFeedFiltersTargetId(null);
      setRelationCache({});
      setFeedRelationDialog(null);
      setFeedRelationDialogLoading(false);
      setFragmentDialog(null);
      setPendingAreaResize(null);
      setAreaResizePreviewMode("shift-range");
      setActiveProblemIndex(0);
      setProblemNavStarted(false);
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
  // Resolve `feed.coluna` -> valores da coluna do alimentador/fragmento (por id ou
  // titulo do feed; coluna por chave ou rotulo). Usado pelo motor de formulas.
  const resolveFeedColumnValues = useCallback(
    (feedRef: string, column: string): FormulaScalar[] => {
      const ref = feedRef.trim().toLowerCase();
      // Casa por id, titulo, titulo sem espacos (titulos com espaco nao viram um
      // unico token na formula) ou nome da tabela (primeiro alimentador da tabela).
      const target =
        feedDataTargets.find((item) => {
          const title = item.title?.trim().toLowerCase() ?? "";
          return item.id.toLowerCase() === ref || title === ref || title.replace(/\s+/g, "") === ref;
        }) ??
        feedDataTargets.find((item) => item.table.toLowerCase() === ref) ??
        null;
      if (!target) return [];

      const record = feedDataByTargetId[target.id];
      if (!record) return [];

      const col = column.trim().toLowerCase();
      const columnKey =
        target.columns.find((candidate) => candidate.toLowerCase() === col) ??
        target.columns.find((candidate) => (target.columnLabels[candidate] ?? candidate).toLowerCase() === col);
      if (!columnKey) return [];

      const lookup = feedRelationDisplayLookupByTargetId[target.id] ?? {};
      return record.rows.map((row) => formatPlaygroundFeedValue(resolveDisplayValueFromLookup(row, columnKey, lookup)));
    },
    [feedDataTargets, feedDataByTargetId, feedRelationDisplayLookupByTargetId]
  );

  // Avalia as celulas-formula manuais (que nao estejam cobertas por alimentador).
  // Recalcula quando dados de alimentador, celulas manuais ou refs mudam.
  const formulaDisplay = useMemo<Record<string, string>>(() => {
    if (!activePage) return {};

    const formulaCells: Record<string, string> = {};
    for (const [key, cell] of Object.entries(activePage.cells)) {
      if (isFormula(cell.value) && !feedDisplayCells[key]) formulaCells[key] = cell.value;
    }
    if (Object.keys(formulaCells).length === 0) return {};

    const results = evaluateSheetFormulas({
      formulaCells,
      getRawCellValue: (row, col) => {
        const key = `${row}:${col}`;
        const feedCell = feedDisplayCells[key];
        if (feedCell) return feedCell.value;
        const manual = activePage.cells[key];
        return manual && manual.value !== "" ? manual.value : null;
      },
      getColumnValues: resolveFeedColumnValues
    });

    return Object.fromEntries(Object.entries(results).map(([key, result]) => [key, formatFormulaResult(result)]));
  }, [activePage, feedDisplayCells, resolveFeedColumnValues]);

  const printablePage = useMemo(() => {
    if (!activePage) return null;

    const cells: Record<string, PlaygroundCell> = {
      ...activePage.cells,
      ...feedDisplayCells
    };
    // Sobrepoe o texto bruto das formulas pelo resultado computado (so exibicao;
    // a formula crua segue em activePage.cells para edicao).
    for (const [key, display] of Object.entries(formulaDisplay)) {
      cells[key] = { ...activePage.cells[key], value: display };
    }

    return {
      ...activePage,
      cells
    };
  }, [activePage, feedDisplayCells, formulaDisplay]);

  // Problemas do grid surfacados na bolinha de alerta: valores manuais
  // encobertos por alimentadores e alimentadores sobrepostos entre si.
  const playgroundProblems = useMemo<PlaygroundProblem[]>(() => {
    if (!activePage) return [];
    return detectPlaygroundProblems({
      targets: feedDataTargets,
      recordsByTargetId: feedDataByTargetId,
      feedDisplayCells,
      manualCells: activePage.cells
    });
  }, [activePage, feedDataByTargetId, feedDataTargets, feedDisplayCells]);
  const problemCellKeys = useMemo(
    () => new Set(playgroundProblems.map((problem) => `${problem.row}:${problem.col}`)),
    [playgroundProblems]
  );
  const activeProblemPosition = activeProblemIndex >= 0 && activeProblemIndex < playgroundProblems.length ? activeProblemIndex : 0;
  const activeProblem = playgroundProblems[activeProblemPosition] ?? null;
  const activeProblemKey = problemNavStarted && activeProblem ? `${activeProblem.row}:${activeProblem.col}` : null;

  function scrollGridToCell(row: number, col: number) {
    const node = gridScrollRef.current;
    if (!node || !activePage) return;

    let innerTop = 0;
    for (let r = 0; r < row; r += 1) {
      if (!isRowHidden(activePage, r)) innerTop += getRowHeight(activePage, r);
    }
    let innerLeft = 0;
    for (let c = 0; c < col; c += 1) {
      if (!isColumnHidden(activePage, c)) innerLeft += getColumnWidth(activePage, c);
    }

    // O scroller trabalha em coordenadas externas (pos-zoom); o canvas e zoomado.
    const currentZoom = workbook?.preferences.zoom ?? 1;
    node.scrollTo({
      top: Math.max(0, (PLAYGROUND_COLUMN_HEADER_HEIGHT + innerTop) * currentZoom - node.clientHeight / 3),
      left: Math.max(0, (PLAYGROUND_ROW_HEADER_WIDTH + innerLeft) * currentZoom - node.clientWidth / 3),
      behavior: "smooth"
    });
  }

  function focusProblemCell(row: number, col: number) {
    if (!activePage) return;
    setSelection(buildCellSelection({ row, col }));
    setActiveCell({ row, col });
    setEditingCell(null);
    setFormulaValue(getCell(activePage, row, col).value);
    scrollGridToCell(row, col);
  }

  function goToNextProblem() {
    if (playgroundProblems.length === 0) return;

    const nextIndex = problemNavStarted ? (activeProblemPosition + 1) % playgroundProblems.length : 0;
    setProblemNavStarted(true);
    setActiveProblemIndex(nextIndex);

    const problem = playgroundProblems[nextIndex];
    focusProblemCell(problem.row, problem.col);
    setInfo(problem.message);
    setError(null);
  }

  const currentEditingFeed = useMemo(() => {
    if (!activePage || !editingFeedId) return null;
    return activePage.feeds.find((feed) => feed.id === editingFeedId) ?? null;
  }, [activePage, editingFeedId]);
  // Quando ha um fragmento selecionado, o configurador passa a operar nele;
  // o painel do alimentador pai fica colapsado por baixo ate o usuario voltar.
  const currentEditingFragment = useMemo(() => {
    if (!currentEditingFeed || !feedHubFragmentId) return null;
    return currentEditingFeed.fragments.find((fragment) => fragment.id === feedHubFragmentId) ?? null;
  }, [currentEditingFeed, feedHubFragmentId]);
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
    const liveTarget = feedDataTargets.find((target) => target.id === fragmentDialog.feedId && target.kind === "feed");
    if (liveTarget) return liveTarget;
    // Alimentador oculto: nao ha target "feed" ao vivo (so os fragmentos sao
    // renderizados). Deriva um target efemero do feed para o dialog de fragmentos
    // continuar funcionando (tabela/query/colunas para buscar as opcoes).
    return activeFragmentFeed ? buildParentFeedDataTarget(activeFragmentFeed) : null;
  }, [feedDataTargets, fragmentDialog, activeFragmentFeed]);
  // Lookup de FK (id -> rotulo) do alimentador para o dialog de fragmentos. Com o
  // pai oculto nao ha entrada ao vivo, entao reconstroi do feed (o relationCache e
  // global; nao depende das linhas carregadas do pai) — senao os valores apareceriam
  // como UUID/ids crus em vez do nome do modelo.
  const resolveFragmentRelationLookup = useCallback(
    (feedId: string): Record<string, Record<string, unknown>> => {
      const live = feedRelationDisplayLookupByTargetId[feedId];
      if (live) return live;
      const feed = activePage?.feeds.find((item) => item.id === feedId);
      return feed ? buildRelationDisplayLookup(feed.table, feed.displayColumnOverrides, relationCache) : {};
    },
    [feedRelationDisplayLookupByTargetId, activePage, relationCache]
  );
  const fragmentDialogFeedId = fragmentDialog?.feedId ?? null;
  const fragmentDialogSourceColumn = fragmentDialog?.sourceColumn ?? null;
  const fragmentDialogEditId = fragmentDialog?.editFragmentId ?? null;
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
  const filteredConfigFilterOptions = useMemo(() => {
    const search = configFilterSearch.trim().toLowerCase();
    if (!search) return configFilterOptions;

    return configFilterOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(search) ||
        option.literal.toLowerCase().includes(search) ||
        (option.literal === EMPTY_FILTER_LITERAL && "vazio".includes(search))
    );
  }, [configFilterOptions, configFilterSearch]);
  const activeFragmentOptions = useMemo(() => {
    if (!fragmentDialog) return [];

    const editId = fragmentDialog.editFragmentId ?? null;
    // Em edicao, ignora os literais do PROPRIO fragmento (eles devem aparecer e
    // poder ser desmarcados); demais fragmentos continuam ocultos.
    const consideredFragments = activeFragmentFeed
      ? activeFragmentFeed.fragments.filter((fragment) => fragment.id !== editId)
      : [];
    // Inclui valores tomados por fragmentos agrupados (literais expandidos via |).
    const existingLiterals = getEffectiveFragmentLiterals(consideredFragments, fragmentDialog.sourceColumn);

    // Garante que os valores atuais do fragmento editado aparecam mesmo se os
    // facets ainda nao os trouxeram (ex.: fallback local pos-exclusao do pai).
    let options = fragmentDialog.options;
    if (editId) {
      const known = new Set(options.map((option) => option.literal));
      const ownExtras = fragmentDialog.selectedLiterals
        .filter((literal) => !known.has(literal))
        .map((literal) => ({ literal, label: literal, count: 0 }));
      if (ownExtras.length > 0) options = [...ownExtras, ...options];
    }

    const search = fragmentDialog.search.trim().toLowerCase();

    return options.filter((option) => {
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
  const { printNow, hasSelection: hasPrintSelection } = usePlaygroundPrint({
    activePage,
    workbook,
    printablePage,
    selection,
    buildPrintDocument,
    onError: setError
  });
  // Opcoes de impressao do popover (um template salvo aplica um conjunto destas).
  const [printOptions, setPrintOptions] = useState({
    showGridLines: true,
    showSheetIndexes: false,
    stripedRows: false
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

    // Deriva o modo (incluir/exceto/matematico) a partir da expressao salva.
    const existingExpression = (target.query.filters[column] ?? "").trim();
    const mathMatch = existingExpression.match(/^(>=|<=|!=|>|<)(.*)$/);
    if (existingExpression.toUpperCase().startsWith("EXCETO ")) {
      setFeedFilterMode("exclude");
      setFeedFilterDraftValues(
        existingExpression
          .slice(7)
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      setFeedFilterMathOp(">");
      setFeedFilterMathValue("");
    } else if (mathMatch) {
      setFeedFilterMode("math");
      setFeedFilterMathOp(mathMatch[1] as ">" | ">=" | "<" | "<=" | "!=");
      setFeedFilterMathValue(mathMatch[2].trim());
      setFeedFilterDraftValues([]);
    } else {
      setFeedFilterMode("include");
      setFeedFilterDraftValues(parseFeedFilterSelection(existingExpression));
      setFeedFilterMathOp(">");
      setFeedFilterMathValue("");
    }

    setFeedFilterSearch("");
    setFeedFilterOptions(localOptions);
    setNestedFilterOpen(false);
    setNestedFilterDraft(null);
    setFeedFilterFullDomain(false);
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

    const column = feedFilterPopover.column;
    if (feedFilterMode === "math") {
      const value = feedFilterMathValue.trim();
      const expression = value ? `${feedFilterMathOp}${value}` : "";
      updateFeedTargetQuery(feedFilterPopover.targetId, (query) => withFeedFilter(query, column, expression));
    } else if (feedFilterMode === "exclude") {
      updateFeedTargetQuery(feedFilterPopover.targetId, (query) =>
        withFeedFilter(query, column, buildExcludedValuesExpression(feedFilterDraftValues))
      );
    } else {
      updateFeedTargetQuery(feedFilterPopover.targetId, (query) =>
        withFeedFilterSelection(query, column, feedFilterDraftValues)
      );
    }

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

  function openNestedFilterBuilder() {
    if (!activeFeedFilterRelation) return;
    setNestedFilterOpen(true);
    setNestedFilterDraft(null);
    void ensureFeedRelationLoaded(activeFeedFilterRelation.table);
  }

  function addNestedRelationFilter() {
    if (!feedFilterPopover || !activeFeedFilterRelation) return;

    // Envolve o sub-predicado em construcao na relacao da coluna FK do feed e
    // normaliza (descarta niveis incompletos). Profundidade arbitraria.
    const candidate = filterRelation({
      column: feedFilterPopover.column,
      table: activeFeedFilterRelation.table,
      keyColumn: activeFeedFilterRelation.keyColumn,
      where: nestedFilterDraft ?? { kind: "leaf", column: "", expression: "" }
    });
    const normalized = normalizeFilterNode(candidate);

    if (!normalized || normalized.kind !== "relation") {
      setError("Complete o filtro aninhado (escolha coluna e valor em cada nivel).");
      return;
    }

    updateFeedTargetQuery(feedFilterPopover.targetId, (query) => ({
      ...query,
      relationFilters: [...(query.relationFilters ?? []), normalized],
      page: 1
    }));
    setNestedFilterDraft(null);
    setInfo(`Filtro aninhado adicionado em ${tableLabelByKey[activeFeedFilterRelation.table] ?? activeFeedFilterRelation.table}.`);
    setError(null);
  }

  function removeRelationFilterAt(index: number) {
    if (!feedFilterPopover) return;
    updateFeedTargetQuery(feedFilterPopover.targetId, (query) => ({
      ...query,
      relationFilters: (query.relationFilters ?? []).filter((_, position) => position !== index)
    }));
    setInfo("Filtro aninhado removido.");
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
    const feed = activePage?.feeds.find((item) => item.id === feedId);
    // Aceita o alimentador oculto: sem target ao vivo, deriva um do feed.
    const target =
      feedDataTargets.find((item) => item.id === feedId && item.kind === "feed") ??
      (feed ? buildParentFeedDataTarget(feed) : null);
    if (!target) return;

    const sourceColumn = target.columns[0] ?? "";
    const localOptions = sourceColumn
      ? buildLocalFeedFilterOptions(
          feedDataByTargetId[feedId]?.rows ?? [],
          sourceColumn,
          resolveFragmentRelationLookup(feedId)
        )
      : [];

    setFragmentDialog({
      feedId,
      editFragmentId: null,
      fragmentMode: "value",
      rowsPerBlock: 10,
      sourceColumn,
      selectedLiterals: [],
      selectionMode: "include",
      search: "",
      options: localOptions,
      loading: Boolean(sourceColumn),
      groupSelected: false,
      groupLabel: ""
    });
    setInfo(null);
    setError(null);
  }

  /**
   * Abre o dialog em modo EDICAO de um fragmento: pre-seleciona os valores que
   * ele ja cobre para o usuario adicionar/remover possibilidades. Os facets sao
   * buscados sem a exclusao da coluna-fonte (ver effect) para mostrar o dominio
   * completo, incluindo os valores ja pertencentes ao fragmento.
   */
  function openFragmentValueEditor(feedId: string, fragment: PlaygroundFeedFragment) {
    const sourceColumn = fragment.sourceColumn;
    if (!sourceColumn) return;

    const currentLiterals = fragment.valueLiteral
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);
    const localOptions = buildLocalFeedFilterOptions(
      feedDataByTargetId[feedId]?.rows ?? [],
      sourceColumn,
      resolveFragmentRelationLookup(feedId)
    );

    setFragmentDialog({
      feedId,
      editFragmentId: fragment.id,
      fragmentMode: "value",
      rowsPerBlock: 10,
      sourceColumn,
      selectedLiterals: currentLiterals,
      selectionMode: "include",
      search: "",
      options: localOptions,
      loading: true,
      groupSelected: true,
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

    // Resolve os literais que de fato viram fragmentos. No modo "except" os
    // valores marcados sao exclusoes: fragmenta todos os disponiveis (ainda nao
    // tomados por outro fragmento) menos os marcados.
    const takenLiterals = getEffectiveFragmentLiterals(activeFragmentFeed.fragments, fragmentDialog.sourceColumn);
    const effectiveLiterals =
      fragmentDialog.selectionMode === "except"
        ? fragmentDialog.options
            .map((option) => option.literal)
            .filter((literal) => !takenLiterals.has(literal) && !fragmentDialog.selectedLiterals.includes(literal))
        : fragmentDialog.selectedLiterals;

    if (effectiveLiterals.length === 0) {
      setError(
        fragmentDialog.selectionMode === "except"
          ? "Nenhum valor restante para fragmentar (todos foram excluidos)."
          : "Selecione ao menos um valor para fragmentar."
      );
      return;
    }

    try {
      let fragments: PlaygroundFeed["fragments"];

      if (fragmentDialog.groupSelected) {
        // Grouped mode: single fragment that aggregates every effective literal.
        const selectedLiterals = effectiveLiterals;
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
        // Per-value mode: one fragment per effective literal (legacy behaviour).
        const selectedLiterals = effectiveLiterals.filter(
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

  /**
   * Modo EDICAO: atualiza o conjunto de valores de um fragmento existente em vez
   * de criar novos. A exclusao no pai e recalculada no fetch a partir do novo
   * valueLiteral, entao basta substituir o fragmento e marcar renderedAt.
   */
  function applyFragmentValueEdit() {
    if (!activePage || !fragmentDialog || !activeFragmentFeed || !fragmentDialog.editFragmentId) return;

    const fragment = activeFragmentFeed.fragments.find((item) => item.id === fragmentDialog.editFragmentId);
    if (!fragment) {
      setError("Fragmento nao encontrado.");
      return;
    }

    if (fragmentDialog.selectedLiterals.length === 0) {
      setError("Selecione ao menos um valor (ou remova o fragmento).");
      return;
    }

    const updated = updateFeedFragmentLiterals({
      fragment,
      options: fragmentDialog.options,
      selectedLiterals: fragmentDialog.selectedLiterals
    });

    if (!updated) {
      setError("Selecione ao menos um valor para o fragmento.");
      return;
    }

    const now = new Date().toISOString();
    updatePageById(activePage.id, (page) => ({
      ...page,
      feeds: page.feeds.map((feed) =>
        feed.id === activeFragmentFeed.id
          ? {
              ...feed,
              fragments: feed.fragments.map((item) => (item.id === updated.id ? updated : item)),
              renderedAt: now
            }
          : feed
      ),
      updatedAt: now
    }));
    setFragmentDialog(null);
    setInfo("Valores do fragmento atualizados.");
    setError(null);
  }

  function applyRowSliceFragments() {
    if (!activePage || !fragmentDialog || !activeFragmentFeed) return;

    const rowsPerBlock = Math.max(1, Math.floor(fragmentDialog.rowsPerBlock || 0));
    if (rowsPerBlock < 1) {
      setError("Informe quantas linhas por bloco.");
      return;
    }

    const record = feedDataByTargetId[fragmentDialog.feedId];
    const totalRows = record?.totalRows ?? record?.rows.length ?? 0;
    if (totalRows <= 0) {
      setError("Atualize o alimentador antes de fragmentar por linhas.");
      return;
    }

    const blockCount = Math.ceil(totalRows / rowsPerBlock);
    if (blockCount <= 1) {
      setError("O alimentador ja cabe em um unico bloco desse tamanho.");
      return;
    }

    const colSpan = Math.max(1, activeFragmentFeed.columns.length);
    const rowSpan = rowsPerBlock + 1; // +1 do cabecalho de colunas
    const sliceSize = { rowSpan, colSpan };
    const bounds = { rowCount: activePage.rowCount, colCount: activePage.colCount };
    const occupiedRects = feedDataTargets.map((target) => ({
      ...target.position,
      ...getFeedTargetGridSize(target)
    }));
    const usedIds = new Set([
      ...activePage.feeds.map((feed) => feed.id),
      ...activePage.feeds.flatMap((feed) => feed.fragments.map((fragment) => fragment.id))
    ]);

    try {
      const fragments: PlaygroundFeed["fragments"] = [];
      for (let index = 0; index < blockCount; index += 1) {
        const desiredPosition = {
          row: activeFragmentFeed.position.row + index * (rowSpan + 1),
          col: activeFragmentFeed.position.col
        };
        const position = findNearestAvailableGridPosition({ desiredPosition, size: sliceSize, bounds, occupiedRects });
        if (!position) {
          throw new Error("Nao ha espaco livre no grid para todos os blocos.");
        }
        occupiedRects.push({ ...position, rowSpan, colSpan });

        fragments.push(
          createRowSliceFragment({
            feed: activeFragmentFeed,
            page: index + 1,
            rowsPerBlock,
            totalRows,
            position,
            id: createFragmentId(activeFragmentFeed.id, "linhas", String(index + 1), index, usedIds)
          })
        );
      }

      const now = new Date().toISOString();
      // Oculta o alimentador pai: os blocos passam a representa-lo inteiro.
      updatePageById(activePage.id, (page) => ({
        ...page,
        feeds: page.feeds.map((feed) =>
          feed.id === activeFragmentFeed.id
            ? { ...upsertFeedFragments({ ...feed, hidden: true }, fragments), renderedAt: now }
            : feed
        ),
        updatedAt: now
      }));
      setFragmentDialog(null);
      setInfo(`Alimentador dividido em ${blockCount} bloco(s) de ${rowsPerBlock} linha(s). O bloco original foi ocultado.`);
      setError(null);
    } catch (sliceError) {
      setError(buildErrorMessage(sliceError));
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

    // Celula-formula manual: a barra mostra a formula CRUA (editavel); demais
    // celulas mostram o valor exibido (resultado da formula, dado do alimentador).
    const manualCell = activePage.cells[`${activeCell.row}:${activeCell.col}`];
    setFormulaValue(
      manualCell && isFormula(manualCell.value)
        ? manualCell.value
        : getCell(printablePage ?? activePage, activeCell.row, activeCell.col).value
    );
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
    // #7: no modo "todos os valores", ignora os filtros do feed (dominio completo
    // da coluna na tabela). Caso contrario, usa os filtros atuais (tempo-real).
    const facetFilters = feedFilterFullDomain ? {} : activeFeedFilterTarget.query.filters;
    const facetCacheKey = `${activeFeedFilterTarget.id}:${activeFeedFilterRequestKey}:${feedFilterPopover.column}:${feedFilterFullDomain ? "all" : "scoped"}`;
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
      query: feedFilterFullDomain ? "" : activeFeedFilterTarget.query.query,
      matchMode: activeFeedFilterTarget.query.matchMode,
      filters: facetFilters,
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
    feedFilterFullDomain,
    feedFilterPopover,
    feedRelationDisplayLookupByTargetId,
    requestAuth
  ]);

  useEffect(() => {
    if (!configFilterPopover || !feedTable) return;

    const controller = new AbortController();
    setConfigFilterLoading(true);

    fetchPlaygroundColumnFacets({
      table: feedTable,
      column: configFilterPopover.column,
      requestAuth,
      query: "",
      matchMode: "contains",
      filters: {},
      signal: controller.signal
    })
      .then((payload) => {
        setConfigFilterOptions(payload.options);
      })
      .catch((facetError) => {
        if (facetError instanceof DOMException && facetError.name === "AbortError") return;
        setConfigFilterOptions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setConfigFilterLoading(false);
      });

    return () => controller.abort();
  }, [configFilterPopover, feedTable, requestAuth]);

  useEffect(() => {
    if (!feedDialogOpen && configFilterPopover) {
      closeConfigFilterPopover();
    }
  }, [feedDialogOpen, configFilterPopover]);

  // Pre-carrega colunas das tabelas alvo de PROCH para popular os selects do
  // formulario sem precisar o usuario clicar para forcar carga.
  useEffect(() => {
    if (!feedDialogOpen) return;
    const seen = new Set<SheetKey>();
    for (const proch of feedProchColumns) {
      if (proch.lookupTable && !seen.has(proch.lookupTable)) {
        seen.add(proch.lookupTable);
        if (!tableColumnsByKey[proch.lookupTable]) {
          void loadTableColumns(proch.lookupTable);
        }
      }
    }
  }, [feedDialogOpen, feedProchColumns, loadTableColumns, tableColumnsByKey]);

  useEffect(() => {
    if (!fragmentDialogFeedId || !fragmentDialogSourceColumn || !activeFragmentTarget) return;

    const controller = new AbortController();
    const fragmentRelationDisplayLookup = resolveFragmentRelationLookup(fragmentDialogFeedId);
    const localOptions = buildLocalFeedFilterOptions(
      feedDataByTargetId[fragmentDialogFeedId]?.rows ?? [],
      fragmentDialogSourceColumn,
      fragmentRelationDisplayLookup
    );
    // Em edicao, busca o DOMINIO COMPLETO da coluna: remove a exclusao da
    // propria coluna-fonte (o pai exclui os valores ja fragmentados) para que os
    // valores atuais do fragmento tambem aparecam e possam ser desmarcados.
    const facetFilters = fragmentDialogEditId
      ? Object.fromEntries(
          Object.entries(activeFragmentTarget.query.filters).filter(([column]) => column !== fragmentDialogSourceColumn)
        )
      : activeFragmentTarget.query.filters;
    const facetCacheKey = `${activeFragmentTarget.id}:${buildPlaygroundFeedRequestKey(activeFragmentTarget)}:${fragmentDialogSourceColumn}:${fragmentDialogEditId ? "edit" : "new"}`;
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
      filters: facetFilters,
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
    resolveFragmentRelationLookup,
    fragmentDialogEditId,
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
    setFeedProchColumns([]);
    setFeedFilterDrafts({});
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
    setFeedProchColumns([]);
    setFeedFilterDrafts({});
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

  function savePrintTemplate() {
    const name = window.prompt("Nome do template de impressao");
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome para o template.");
      return;
    }
    const template = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tpl-${Date.now()}`,
      name: trimmed,
      showGridLines: printOptions.showGridLines,
      showSheetIndexes: printOptions.showSheetIndexes,
      stripedRows: printOptions.stripedRows
    };
    updateWorkbookPreferences((preferences) => ({
      ...preferences,
      printTemplates: [...preferences.printTemplates, template]
    }));
    setInfo(`Template "${trimmed}" salvo.`);
    setError(null);
  }

  function removePrintTemplate(id: string) {
    updateWorkbookPreferences((preferences) => ({
      ...preferences,
      printTemplates: preferences.printTemplates.filter((template) => template.id !== id)
    }));
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

  function toggleStripedRows() {
    const nextValue = !workbook?.preferences.stripedRows;

    updateWorkbookPreferences((preferences) => ({
      ...preferences,
      stripedRows: nextValue
    }));
    setInfo(nextValue ? "Linhas destacadas (zebra) ativadas." : "Linhas destacadas desativadas.");
    setError(null);
  }

  function setGridZoom(nextZoom: number) {
    const clamped = Math.min(PLAYGROUND_MAX_ZOOM, Math.max(PLAYGROUND_MIN_ZOOM, nextZoom));
    updateWorkbookPreferences((preferences) => ({ ...preferences, zoom: clamped }));
  }

  function adjustGridZoom(delta: number) {
    const current = workbook?.preferences.zoom ?? 1;
    setGridZoom(current + delta);
  }

  function resetGridZoom() {
    setGridZoom(1);
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
      setFeedHideColumnHeader(false);
      setFeedAnchorFilterColumns([]);
      setFeedProchColumns([]);
      setFeedFilterDrafts({});
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
    setFeedHideColumnHeader(false);
    setFeedAnchorFilterColumns([]);
    setFeedProchColumns([]);
    setFeedFilterDrafts({});

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
    setFeedHideColumnHeader(feed.hideColumnHeader === true);
    setFeedAnchorFilterColumns(normalizeAnchorFilterColumns(query, feed.anchorFilterColumns));
    setFeedProchColumns(feed.prochColumns ?? []);
    setFeedFilterDrafts(
      Object.fromEntries(
        Object.entries(query.filters).filter(([, expression]) => expression.trim().length > 0)
      )
    );

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
    setFeedProchColumns([]);
    setFeedFilterDrafts({});

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

  // ---- PROCH (lookup horizontal estilo PROCV) ----
  function addProchColumnDraft() {
    const id = `__proch__:${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    const defaultLocalKey = activeColumns[0] ?? "";
    const defaultLookupTable: SheetKey | "" = feedTableOptions[0]?.key ?? "";
    const nextColumn: PlaygroundProchColumn = {
      id,
      label: "Coluna PROCH",
      localKeyColumn: defaultLocalKey,
      lookupTable: (defaultLookupTable || "carros") as SheetKey,
      lookupKeyColumn: "",
      lookupValueColumn: ""
    };
    setFeedProchColumns((current) => [...current, nextColumn]);
    setFeedColumns((current) => [...current, id]);
    setFeedColumnLabels((current) => ({ ...current, [id]: nextColumn.label }));
    if (defaultLookupTable) {
      void loadTableColumns(defaultLookupTable);
    }
  }

  function removeProchColumn(id: string) {
    setFeedProchColumns((current) => current.filter((column) => column.id !== id));
    setFeedColumns((current) => current.filter((column) => column !== id));
    setFeedColumnLabels((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updateProchColumn(id: string, patch: Partial<PlaygroundProchColumn>) {
    setFeedProchColumns((current) =>
      current.map((column) => (column.id === id ? { ...column, ...patch } : column))
    );
    if (typeof patch.label === "string") {
      const trimmed = patch.label.trim();
      setFeedColumnLabels((current) => ({ ...current, [id]: trimmed || id }));
    }
  }

  function clearFeedFilterDraft(column: string) {
    setFeedFilterDrafts((current) => {
      if (!(column in current)) return current;
      const next = { ...current };
      delete next[column];
      return next;
    });
    setFeedAnchorFilterColumns((current) => current.filter((entry) => entry !== column));
  }

  function closeConfigFilterPopover() {
    setConfigFilterPopover(null);
    setConfigFilterDraftValues([]);
    setConfigFilterSearch("");
    setConfigFilterOptions([]);
    setConfigFilterLoading(false);
  }

  function openConfigFilterPopover(column: string, label: string, rect: DOMRect) {
    const { top, left, maxHeight } = getClampedPopoverPosition(rect);
    setConfigFilterSearch("");
    setConfigFilterDraftValues(parseFeedFilterSelection(feedFilterDrafts[column] ?? ""));
    setConfigFilterOptions([]);
    setConfigFilterPopover({ column, label, top, left, maxHeight });
  }

  function toggleConfigFilterDraftValue(value: string) {
    setConfigFilterDraftValues((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return Array.from(next);
    });
  }

  function applyConfigFilter() {
    if (!configFilterPopover) return;
    const column = configFilterPopover.column;
    const expression = buildFeedFilterExpressionFromSelection(configFilterDraftValues);

    setFeedFilterDrafts((current) => {
      const next = { ...current };
      if (expression) next[column] = expression;
      else delete next[column];
      return next;
    });
    setFeedAnchorFilterColumns((current) => {
      const filtered = current.filter((entry) => entry !== column);
      if (expression) filtered.push(column);
      return filtered;
    });

    closeConfigFilterPopover();
  }

  function clearConfigFilter() {
    if (!configFilterPopover) return;
    clearFeedFilterDraft(configFilterPopover.column);
    closeConfigFilterPopover();
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
    updatePageById(activePage.id, (page) => {
      const nextFeeds = page.feeds.map((feed) => {
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
      });

      const updated: PlaygroundPage = { ...page, feeds: nextFeeds, updatedAt: now };
      // Aplica anti-overlap: se o fragmento mudou de colSpan (toggle/reorder de
      // colunas pode alterar isso), realoca os vizinhos para slots livres.
      const overlap = resolveFeedOverlapsInPage({ page: updated, priorityFeedId: feedId });
      return overlap.page;
    });
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
    const filtersFromDrafts: Record<string, string> = { ...existingQuery.filters };
    for (const [column, rawExpression] of Object.entries(feedFilterDrafts)) {
      const trimmed = rawExpression.trim();
      if (trimmed) {
        filtersFromDrafts[column] = trimmed;
      } else {
        delete filtersFromDrafts[column];
      }
    }
    for (const column of Object.keys(existingQuery.filters)) {
      if (!(column in feedFilterDrafts)) {
        delete filtersFromDrafts[column];
      }
    }

    const normalizedQuery = normalizeFeedQuery({
      ...existingQuery,
      filters: filtersFromDrafts,
      page: existingQuery.pageSize === Math.round(requestedPageSize) ? existingQuery.page : 1,
      pageSize: requestedPageSize
    });

    // Sanitiza PROCH: descarta colunas incompletas (qualquer campo vazio) e
    // limpa ids orfaos de feedColumns. PROCH so vai pro feed quando totalmente
    // preenchido — o usuario ainda ve no editor as incompletas, mas elas nao
    // entram no rendering.
    const referencedProchIds = new Set(feedColumns.filter((column) => column.startsWith("__proch__:")));
    const isProchFilled = (column: PlaygroundProchColumn) =>
      Boolean(column.localKeyColumn && column.lookupTable && column.lookupKeyColumn && column.lookupValueColumn);
    const sanitizedProchColumns = feedProchColumns
      .filter((column) => referencedProchIds.has(column.id))
      .filter(isProchFilled);
    const validProchIds = new Set(sanitizedProchColumns.map((column) => column.id));
    const filteredColumns = feedColumns.filter(
      (column) => !column.startsWith("__proch__:") || validProchIds.has(column)
    );

    return {
      id: editingFeedId ?? undefined,
      table: feedTable,
      title: feedTitle.trim() || undefined,
      columns: filteredColumns,
      columnLabels: filteredColumns.reduce<Record<string, string>>((acc, column) => {
        const candidate = feedColumnLabels[column]?.trim();
        acc[column] = candidate ? candidate : column;
        return acc;
      }, {}),
      query: normalizedQuery,
      showPaginationInHeader: feedShowPaginationInHeader,
      hideColumnHeader: feedHideColumnHeader,
      anchorFilterColumns: normalizeAnchorFilterColumns(normalizedQuery, feedAnchorFilterColumns).filter(
        (column) => !column.startsWith("__proch__:")
      ),
      prochColumns: sanitizedProchColumns
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
          hideColumnHeader: config.hideColumnHeader,
          // Preserva o estado oculto ao atualizar — senao o alimentador escondido reaparece.
          hidden: existingFeed?.hidden,
          fragments: existingFeed?.fragments ?? [],
          anchorFilterColumns: config.anchorFilterColumns,
          prochColumns: config.prochColumns
        }
      });
      // Anti-overlap: se o numero/disposicao de colunas mudou, os outros
      // alimentadores/fragmentos podem ter passado a sobrepor. Reposicionamos
      // automaticamente para o slot vazio mais proximo do lugar original.
      const overlap = resolveFeedOverlapsInPage({ page: result.page, priorityFeedId: result.feed.id });
      const nextPage = overlap.page;
      const repositionedCount = overlap.resolutions.length;

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
      const repositionMessage =
        repositionedCount > 0
          ? ` ${repositionedCount} ${repositionedCount === 1 ? "vizinho foi reposicionado" : "vizinhos foram reposicionados"} para evitar sobreposicao.`
          : "";
      setInfo(
        `Alimentador ${config.table} ${config.id ? "atualizado" : "inserido"} em ${formatCellAddress(row, col)}. Dados carregados em cache proprio.${truncationMessage}${repositionMessage}`
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

  function removeSelectionFillColor() {
    if (!selection) {
      setError("Selecione uma ou mais celulas antes de remover a cor.");
      return;
    }

    updateActivePage((page) => removeSelectionFill(page, selection));
    setError(null);
    setInfo(`Cor de fundo removida de ${formatSelectionAddress(selection)}.`);
  }

  // Pincel de formatacao: captura o estilo (efetivo) da celula ativa...
  function copyActiveCellFormat() {
    if (!activeCell || !activePage) {
      setError("Selecione uma celula para copiar a formatacao.");
      return;
    }

    const style = getCell(printablePage ?? activePage, activeCell.row, activeCell.col).style;
    const normalized = normalizeCellStyle(style);
    if (!normalized) {
      setError("A celula ativa nao tem formatacao para copiar.");
      return;
    }

    setCopiedStyle(normalized);
    setError(null);
    setInfo("Formatacao copiada. Selecione o destino e cole.");
  }

  // ...e cola na selecao (substitui a formatacao existente).
  function pasteFormatToSelection() {
    if (!copiedStyle) {
      setError("Copie a formatacao de uma celula antes de colar.");
      return;
    }
    if (!selection) {
      setError("Selecione o destino antes de colar a formatacao.");
      return;
    }

    updateActivePage((page) => paintSelection(clearSelectionStyle(page, selection), selection, copiedStyle));
    setError(null);
    setInfo(`Formatacao aplicada em ${formatSelectionAddress(selection)}.`);
  }

  /**
   * Mapeia as celulas selecionadas para (alvo, coluna) de alimentadores/fragmentos
   * tocados pela selecao. Base da formatacao por area dinamica: o estilo e
   * gravado por coluna do alimentador/fragmento (segue o bloco ao mover), nao por
   * posicao absoluta no grid.
   */
  function collectFeedColumnTargetsFromSelection(): Array<{ target: PlaygroundFeedDataTarget; column: string }> {
    if (!selection) return [];

    const norm = normalizeSelection(selection);
    const seen = new Set<string>();
    const result: Array<{ target: PlaygroundFeedDataTarget; column: string }> = [];

    for (let row = norm.startRow; row <= norm.endRow; row += 1) {
      for (let col = norm.startCol; col <= norm.endCol; col += 1) {
        const cell = feedDisplayCells[`${row}:${col}`];
        const targetId = cell?.feedId;
        if (!targetId) continue;

        const target = feedDataTargets.find((item) => item.id === targetId);
        if (!target) continue;

        const columnOffset = col - target.position.col;
        if (columnOffset < 0 || columnOffset >= target.columns.length) continue;

        const column = target.columns[columnOffset];
        const key = `${target.id}:${column}`;
        if (seen.has(key)) continue;

        seen.add(key);
        result.push({ target, column });
      }
    }

    return result;
  }

  function writeFeedColumnStyles(
    entries: Array<{ target: PlaygroundFeedDataTarget; column: string }>,
    style: PlaygroundCellStyle | undefined
  ) {
    if (!activePage || entries.length === 0) return;

    // Agrupa colunas por alimentador (pai) e por fragmento.
    const feedColumns = new Map<string, Set<string>>();
    const fragmentColumns = new Map<string, { feedId: string; columns: Set<string> }>();

    for (const { target, column } of entries) {
      if (target.kind === "fragment" && target.fragmentId) {
        const entry = fragmentColumns.get(target.fragmentId) ?? { feedId: target.feedId, columns: new Set<string>() };
        entry.columns.add(column);
        fragmentColumns.set(target.fragmentId, entry);
      } else {
        const columns = feedColumns.get(target.feedId) ?? new Set<string>();
        columns.add(column);
        feedColumns.set(target.feedId, columns);
      }
    }

    updateActivePage((page) => ({
      ...page,
      feeds: page.feeds.map((feed) => {
        let nextFeed = feed;

        const parentColumns = feedColumns.get(feed.id);
        if (parentColumns) {
          let styles = feed.columnStyles;
          for (const column of parentColumns) styles = setColumnStyle(styles, column, style);
          nextFeed = { ...nextFeed, columnStyles: styles };
        }

        const hasFragmentEdit = nextFeed.fragments.some((fragment) => fragmentColumns.has(fragment.id));
        if (hasFragmentEdit) {
          nextFeed = {
            ...nextFeed,
            fragments: nextFeed.fragments.map((fragment) => {
              const edit = fragmentColumns.get(fragment.id);
              if (!edit) return fragment;
              let styles = fragment.columnStyles;
              for (const column of edit.columns) styles = setColumnStyle(styles, column, style);
              return { ...fragment, columnStyles: styles };
            })
          };
        }

        return nextFeed;
      })
    }));
  }

  function applyColumnFormatToSelection() {
    const entries = collectFeedColumnTargetsFromSelection();
    if (entries.length === 0) {
      setError("Selecione celulas dentro de um alimentador/fragmento para formatar a coluna.");
      return;
    }

    writeFeedColumnStyles(entries, normalizeCellStyle({ background: fillColor, color: textColor, bold: paintBold }));
    setError(null);
    setInfo(`Formatacao aplicada a ${entries.length} coluna(s) de alimentador/fragmento.`);
  }

  function clearColumnFormatFromSelection() {
    const entries = collectFeedColumnTargetsFromSelection();
    if (entries.length === 0) {
      setError("Selecione celulas dentro de um alimentador/fragmento para limpar a formatacao da coluna.");
      return;
    }

    writeFeedColumnStyles(entries, undefined);
    setError(null);
    setInfo(`Formatacao de coluna removida de ${entries.length} alvo(s).`);
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

  // Centra os scrolls do grid sobre uma celula (row, col), usado pelo botao
  // "Localizar" no configurador para trazer o alimentador/fragmento alvo a tela.
  function scrollGridToPosition(targetRow: number, targetCol: number) {
    const node = gridScrollRef.current;
    if (!node || !activePage) return;

    let top = PLAYGROUND_COLUMN_HEADER_HEIGHT;
    for (let row = 0; row < targetRow; row += 1) {
      if (!isRowHidden(activePage, row)) top += getRowHeight(activePage, row);
    }
    let left = PLAYGROUND_ROW_HEADER_WIDTH;
    for (let col = 0; col < targetCol; col += 1) {
      if (!isColumnHidden(activePage, col)) left += getColumnWidth(activePage, col);
    }
    const cellHeight = getRowHeight(activePage, targetRow);
    const cellWidth = getColumnWidth(activePage, targetCol);
    const scrollTop = Math.max(0, top - node.clientHeight / 2 + cellHeight / 2);
    const scrollLeft = Math.max(0, left - node.clientWidth / 2 + cellWidth / 2);
    node.scrollTo({ top: scrollTop, left: scrollLeft, behavior: "smooth" });
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
    // Edita a formula CRUA (nao o resultado computado mostrado no grid).
    setEditingValue(getCell(activePage, row, col).value);
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

  // Insere o nome da funcao escolhida na barra de formula, substituindo o token
  // que esta sendo digitado e abrindo o parentese para os argumentos.
  function insertFormulaFunction(name: string) {
    setFormulaValue((prev) => {
      const base = prev.trim().startsWith("=") ? prev : `=${prev}`;
      const token = currentFormulaToken(base);
      const withoutToken = token ? base.slice(0, base.length - token.length) : base;
      return `${withoutToken}${name}(`;
    });
    setFormulaSuggestOpen(true);
    window.setTimeout(() => formulaInputRef.current?.focus(), 0);
  }

  function openFormulaSuggestions() {
    setFormulaValue((prev) => (prev.trim().startsWith("=") ? prev : "="));
    setFormulaSuggestOpen(true);
    formulaInputRef.current?.focus();
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

  // Serializa a selecao atual (valores EXIBIDOS, ja com formulas/alimentadores
  // resolvidos) como TSV — formato compativel com Excel/Sheets — e copia para a
  // area de transferencia. Mantem uma copia interna como fallback.
  function buildSelectionClipboardText() {
    const sourcePage = printablePage ?? activePage;
    if (!sourcePage) return null;
    const range = selection
      ? clampSelectionToPage(sourcePage, selection)
      : activeCell
        ? buildCellSelection(activeCell)
        : null;
    if (!range) return null;

    const lines: string[] = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      const cols: string[] = [];
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        cols.push(getCell(sourcePage, row, col).value ?? "");
      }
      lines.push(cols.join("\t"));
    }
    return lines.join("\n");
  }

  function copySelectionToClipboard(options?: { cut?: boolean }) {
    const text = buildSelectionClipboardText();
    if (text == null) {
      setError("Selecione uma ou mais celulas antes de copiar.");
      return;
    }

    internalClipboardRef.current = text;
    const label = selection ? formatSelectionAddress(selection) : activeCell ? formatCellAddress(activeCell.row, activeCell.col) : "";

    const finish = () => {
      if (options?.cut) {
        clearSelectedValues();
        setInfo(`Conteudo recortado de ${label}.`);
      } else {
        setInfo(`Conteudo copiado de ${label}.`);
      }
      setError(null);
    };

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(finish);
    } else {
      finish();
    }
  }

  async function pasteClipboardIntoSelection() {
    if (!activePage || !activeCell) {
      setError("Selecione a celula inicial antes de colar.");
      return;
    }

    let text: string | null = null;
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = null;
      }
    }
    // Fallback: cola o ultimo conteudo copiado dentro do proprio playground.
    if (text == null || text === "") {
      text = internalClipboardRef.current;
    }
    if (text == null || text === "") {
      setError("Nada para colar (area de transferencia vazia ou bloqueada pelo navegador).");
      return;
    }

    const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
    const matrix = rows.map((line) => line.split("\t"));

    const startRow = activeCell.row;
    const startCol = activeCell.col;
    let skippedFeedCells = false;
    let lastRow = startRow;
    let lastCol = startCol;

    updateActivePage((page) => {
      let next = page;
      for (let r = 0; r < matrix.length; r += 1) {
        const targetRow = startRow + r;
        if (targetRow >= page.rowCount) break;
        for (let c = 0; c < matrix[r].length; c += 1) {
          const targetCol = startCol + c;
          if (targetCol >= page.colCount) break;
          // Celulas derivadas de alimentador nao podem ser sobrescritas.
          if (getCell(next, targetRow, targetCol).feedId) {
            skippedFeedCells = true;
            continue;
          }
          next = updateCellValue(next, targetRow, targetCol, matrix[r][c]);
          lastRow = Math.max(lastRow, targetRow);
          lastCol = Math.max(lastCol, targetCol);
        }
      }
      return next;
    });

    setEditingCell(null);
    setSelection({ startRow, startCol, endRow: lastRow, endCol: lastCol });
    setInfo(
      skippedFeedCells
        ? "Conteudo colado. Celulas de alimentador foram preservadas."
        : `Conteudo colado em ${formatCellAddress(startRow, startCol)}.`
    );
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

  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement> | KeyboardEvent) {
    if (!activePage || mode === "target_select") return;
    if (editingCell) return;

    // Enquanto algum dialogo/popover modal esta aberto, o teclado pertence a ele
    // — nao mexemos no grid por baixo.
    const blockingOverlayOpen =
      feedDialogOpen ||
      Boolean(fragmentDialog) ||
      Boolean(pendingAreaResize) ||
      Boolean(feedRelationDialog) ||
      Boolean(feedFilterPopover) ||
      Boolean(configFilterPopover) ||
      Boolean(feedActionPopover) ||
      Boolean(activeFeedFiltersTargetId);
    if (blockingOverlayOpen) return;

    const currentPage = activePage;

    const target = event.target as HTMLElement | null;
    // Nao sequestramos a digitacao em campos de texto/seletores nem em conteudo
    // editavel (barra de formula, dialogos). Botoes (ferramentas) NAO bloqueiam:
    // o usuario espera que Ctrl+C/V e Del continuem agindo sobre a selecao do
    // grid mesmo depois de clicar numa ferramenta da barra.
    if (
      target &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
    ) {
      return;
    }
    const targetIsButton = target?.tagName === "BUTTON";

    // Ctrl/Cmd + C/X/V/A: copiar / recortar / colar / selecionar tudo.
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const comboKey = event.key.toLowerCase();
      if (comboKey === "c") {
        event.preventDefault();
        copySelectionToClipboard();
        return;
      }
      if (comboKey === "x") {
        event.preventDefault();
        copySelectionToClipboard({ cut: true });
        return;
      }
      if (comboKey === "v") {
        event.preventDefault();
        void pasteClipboardIntoSelection();
        return;
      }
      if (comboKey === "a") {
        event.preventDefault();
        selectWholeSheet();
        return;
      }
      return;
    }

    // Del/Backspace agem na selecao mesmo com uma ferramenta (botao) focada.
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearSelectedValues();
      return;
    }

    // Navegacao/digitacao so quando o foco NAO esta num botao (evita conflito com
    // a ativacao do proprio botao via Enter/Espaco).
    if (targetIsButton) return;

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

  // Mantem o ref apontando para o handler mais recente (closures atualizadas).
  gridKeyHandlerRef.current = handleGridKeyDown;

  // Listener global: atalhos (Ctrl+C/V/X/A, Del, navegacao) funcionam mesmo
  // quando o foco saiu do grid (ex.: depois de clicar numa ferramenta da barra).
  // Quando o proprio grid esta focado, seu onKeyDown ja tratou — evitamos
  // disparo duplicado.
  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      const grid = gridScrollRef.current;
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (grid && active && grid.contains(active)) return;
      gridKeyHandlerRef.current?.(event);
    }

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  function removeFeed(feed: PlaygroundFeed) {
    if (!activePage) return;
    if (!window.confirm(`Remover o alimentador ${feed.table} desta pagina?`)) return;

    updatePageById(activePage.id, (page) => removeFeedFromPage(page, feed.id));

    if (editingFeedId === feed.id) {
      setEditingFeedId(null);
      setFeedAnchorFilterColumns([]);
      setFeedProchColumns([]);
      setFeedFilterDrafts({});
      if (feedTableOptions.length > 0) {
        startNewFeed();
      }
    }

    setInfo(`Alimentador ${feed.table} removido.`);
    setError(null);
  }

  // Oculta apenas o alimentador pai; os fragmentos seguem renderizados no
  // grid. Configurador continua mostrando o pai marcado como oculto com
  // opcao de reativar.
  function hideFeed(feedId: string) {
    if (!activePage) return;
    const feed = activePage.feeds.find((entry) => entry.id === feedId);
    if (!feed) return;

    updatePageById(activePage.id, (page) => ({
      ...page,
      feeds: page.feeds.map((entry) => (entry.id === feedId ? { ...entry, hidden: true } : entry)),
      updatedAt: new Date().toISOString()
    }));

    setInfo(`Alimentador ${feed.title?.trim() || feed.table} ocultado. Reative no configurador.`);
    setError(null);
  }

  function duplicateFeed(feedId: string) {
    if (!activePage) return;
    const feed = activePage.feeds.find((entry) => entry.id === feedId);
    if (!feed) return;

    const size = getFeedTargetGridSize({
      columns: feed.columns,
      query: feed.query,
      hideColumnHeader: feed.hideColumnHeader
    });
    // Ocupacao atual (feeds + fragmentos) para achar o slot livre mais proximo.
    const occupiedRects = feedDataTargets.map((target) => ({
      ...target.position,
      ...getFeedTargetGridSize(target)
    }));
    const position = findNearestAvailableGridPosition({
      desiredPosition: { row: feed.position.row, col: feed.position.col + feed.columns.length + 1 },
      size,
      bounds: { rowCount: activePage.rowCount, colCount: activePage.colCount },
      occupiedRects
    });

    if (!position) {
      setError("Nao ha espaco livre no grid para duplicar o alimentador.");
      return;
    }

    updatePageById(activePage.id, (page) =>
      // id omitido => novo alimentador. Fragmentos nao sao copiados (sao itens proprios).
      upsertFeedDefinitionInPage({
        page,
        feed: {
          table: feed.table,
          columns: feed.columns,
          columnLabels: feed.columnLabels,
          targetRow: position.row,
          targetCol: position.col,
          title: feed.title?.trim() ? `${feed.title} (copia)` : undefined,
          query: feed.query,
          displayColumnOverrides: feed.displayColumnOverrides,
          showPaginationInHeader: feed.showPaginationInHeader,
          hideColumnHeader: feed.hideColumnHeader,
          hidden: false,
          anchorFilterColumns: feed.anchorFilterColumns,
          prochColumns: feed.prochColumns
        }
      }).page
    );

    setInfo(`Alimentador ${feed.title?.trim() || feed.table} duplicado.`);
    setError(null);
  }

  function showFeed(feedId: string) {
    if (!activePage) return;
    const feed = activePage.feeds.find((entry) => entry.id === feedId);
    if (!feed) return;

    updatePageById(activePage.id, (page) => ({
      ...page,
      feeds: page.feeds.map((entry) => (entry.id === feedId ? { ...entry, hidden: false } : entry)),
      updatedAt: new Date().toISOString()
    }));

    setInfo(`Alimentador ${feed.title?.trim() || feed.table} reativado.`);
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
            <div className="playground-formula-field">
              <input
                ref={formulaInputRef}
                className="playground-formula-input"
                value={formulaValue}
                onChange={(event) => {
                  setFormulaValue(event.target.value);
                  setFormulaSuggestOpen(event.target.value.trim().startsWith("="));
                }}
                onFocus={() => setFormulaSuggestOpen(formulaValue.trim().startsWith("="))}
                onBlur={() => window.setTimeout(() => setFormulaSuggestOpen(false), 150)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setFormulaSuggestOpen(false);
                    applyFormulaBarValue();
                  }
                  if (event.key === "Escape") {
                    setFormulaSuggestOpen(false);
                  }
                  // Ctrl/Cmd+C/X aqui copia o VALOR exibido da celula (resultado da
                  // formula), nao o texto cru "=...". So intercepta quando nao ha
                  // trecho selecionado no input (selecao parcial = edicao normal).
                  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                    const comboKey = event.key.toLowerCase();
                    if (comboKey === "c" || comboKey === "x") {
                      const input = event.currentTarget;
                      const hasTextSelection =
                        input.selectionStart != null &&
                        input.selectionEnd != null &&
                        input.selectionStart !== input.selectionEnd;
                      if (!hasTextSelection) {
                        event.preventDefault();
                        copySelectionToClipboard(comboKey === "x" ? { cut: true } : undefined);
                      }
                    }
                  }
                }}
                aria-label="Valor da celula ativa"
                placeholder="Valor ou =FORMULA (ex.: =CONT.SE(B2:B10;&quot;x&quot;))"
                title={"Digite um valor ou uma formula iniciando com =.\nReferencias: A1, B2:D10, ou nomeDoAlimentador.coluna.\nFuncoes: SOMA, MEDIA, CONT.NUM, CONT.SE, SOMASE, SE, MAXIMO, MINIMO."}
              />
              {formulaSuggestOpen && formulaValue.trim().startsWith("=")
                ? (() => {
                    const suggestions = suggestFormulaFunctions(currentFormulaToken(formulaValue));
                    if (suggestions.length === 0) return null;
                    return (
                      <div className="playground-formula-suggestions" data-testid="playground-formula-suggestions">
                        {suggestions.map((fn) => (
                          <button
                            type="button"
                            key={fn.name}
                            className="playground-formula-suggestion"
                            // onMouseDown (nao onClick) para inserir antes do blur fechar o dropdown.
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertFormulaFunction(fn.name);
                            }}
                          >
                            <strong>{fn.signature}</strong>
                            <span>{fn.description}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()
                : null}
            </div>
            <PlaygroundToolButton label="Inserir funcao (=) e ver lista de formulas" onClick={openFormulaSuggestions}>
              ƒx
            </PlaygroundToolButton>
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
            <PlaygroundToolButton label="Remover cor de fundo da selecao" onClick={removeSelectionFillColor}>
              Sem cor
            </PlaygroundToolButton>
            <PlaygroundToolButton label="Copiar formatacao da celula ativa" onClick={copyActiveCellFormat}>
              Cp
            </PlaygroundToolButton>
            <PlaygroundToolButton
              label="Colar formatacao na selecao"
              onClick={pasteFormatToSelection}
              disabled={!copiedStyle}
            >
              Cl
            </PlaygroundToolButton>
            <PlaygroundToolButton
              label="Formatar coluna do alimentador (segue o bloco ao mover)"
              onClick={applyColumnFormatToSelection}
            >
              Col
            </PlaygroundToolButton>
            <PlaygroundToolButton
              label="Limpar formatacao da coluna do alimentador"
              onClick={clearColumnFormatFromSelection}
            >
              Col✕
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
            <PlaygroundToolButton
              label={workbook.preferences.stripedRows ? "Desativar linhas destacadas (zebra)" : "Linhas destacadas (zebra cinza intercalada)"}
              onClick={toggleStripedRows}
              active={workbook.preferences.stripedRows}
            >
              <span className="playground-stripe-icon" aria-hidden="true" />
            </PlaygroundToolButton>
          </div>

          <div className="playground-tool-cluster">
            <PlaygroundToolButton label="Reduzir zoom" onClick={() => adjustGridZoom(-0.1)} disabled={workbook.preferences.zoom <= PLAYGROUND_MIN_ZOOM + 0.001}>
              -
            </PlaygroundToolButton>
            <button
              type="button"
              className="playground-mode-pill"
              title="Restaurar zoom para 100% (Ctrl+0)"
              data-testid="playground-zoom-reset"
              onClick={resetGridZoom}
            >
              {`${Math.round(workbook.preferences.zoom * 100)}%`}
            </button>
            <PlaygroundToolButton label="Aumentar zoom" onClick={() => adjustGridZoom(0.1)} disabled={workbook.preferences.zoom >= PLAYGROUND_MAX_ZOOM - 0.001}>
              +
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
            <details className="playground-print-menu">
              <summary
                className="playground-tool-button"
                title="Imprimir (abre em outra aba)"
                aria-label="Imprimir"
                data-testid="playground-print-menu"
              >
                🖨
              </summary>
              <div
                className="playground-print-pop"
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="playground-print-pop-opts">
                  <label>
                    <input
                      type="checkbox"
                      checked={printOptions.showGridLines}
                      onChange={(event) => setPrintOptions((prev) => ({ ...prev, showGridLines: event.target.checked }))}
                    />
                    Linhas de grade
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={printOptions.showSheetIndexes}
                      onChange={(event) => setPrintOptions((prev) => ({ ...prev, showSheetIndexes: event.target.checked }))}
                    />
                    Indices (A, B, 1, 2...)
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={printOptions.stripedRows}
                      onChange={(event) => setPrintOptions((prev) => ({ ...prev, stripedRows: event.target.checked }))}
                    />
                    Linhas zebradas
                  </label>
                </div>
                <div className="playground-print-pop-actions">
                  <button type="button" onClick={() => printNow({ scope: "page", ...printOptions })} data-testid="playground-print-page">
                    Imprimir pagina
                  </button>
                  <button
                    type="button"
                    onClick={() => printNow({ scope: "selection", ...printOptions })}
                    disabled={!hasPrintSelection}
                    data-testid="playground-print-selection"
                  >
                    Imprimir selecao
                  </button>
                </div>
                <div className="playground-print-pop-templates">
                  <div className="playground-print-pop-templates-head">
                    <strong>Templates</strong>
                    <button type="button" onClick={savePrintTemplate} data-testid="playground-print-save-template">
                      Salvar atual
                    </button>
                  </div>
                  {workbook.preferences.printTemplates.length === 0 ? (
                    <p className="playground-print-pop-empty">Nenhum template salvo.</p>
                  ) : (
                    workbook.preferences.printTemplates.map((template) => (
                      <div key={template.id} className="playground-print-pop-template">
                        <button
                          type="button"
                          className="playground-print-pop-template-name"
                          title={`Imprimir com "${template.name}"`}
                          onClick={() =>
                            printNow({
                              scope: "page",
                              title: template.name,
                              showGridLines: template.showGridLines,
                              showSheetIndexes: template.showSheetIndexes,
                              stripedRows: template.stripedRows
                            })
                          }
                        >
                          {template.name}
                        </button>
                        <button
                          type="button"
                          className="playground-print-pop-template-remove"
                          aria-label={`Remover template ${template.name}`}
                          onClick={() => removePrintTemplate(template.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>
          </div>

          {playgroundProblems.length > 0 ? (
            <div className="playground-tool-cluster">
              <button
                type="button"
                className="playground-problem-flag"
                data-testid="playground-problem-flag"
                title={
                  activeProblem && problemNavStarted
                    ? activeProblem.message
                    : `${playgroundProblems.length} problema(s) no grid (valores encobertos ou alimentadores sobrepostos). Clique para navegar.`
                }
                aria-label={`${playgroundProblems.length} problemas no grid. Clique para ir ao proximo.`}
                onClick={goToNextProblem}
              >
                <span className="playground-problem-flag-dot" aria-hidden="true" />
                <span className="playground-problem-flag-count" data-testid="playground-problem-flag-count">
                  {problemNavStarted
                    ? `${activeProblemPosition + 1}/${playgroundProblems.length}`
                    : String(playgroundProblems.length)}
                </span>
              </button>
            </div>
          ) : null}
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
        {mode === "target_select" ? (
          <div className="playground-sheet-meta">
            <p className="playground-sheet-hint">
              Modo de destino ativo. Clique na celula inicial em que o alimentador deve aparecer.
            </p>
          </div>
        ) : null}

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
          stripedRows={workbook.preferences.stripedRows}
          problemCellKeys={problemCellKeys}
          activeProblemKey={activeProblemKey}
          zoom={workbook.preferences.zoom}
          onZoomDelta={adjustGridZoom}
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
          onHideFeed={hideFeed}
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

          {activeFeedFilterRelation ? (
            <div className="playground-feed-nested-filter" data-testid={`playground-feed-nested-filter-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}>
              {(activeFeedFilterTarget?.query.relationFilters ?? []).map((relation, index) =>
                relation.column === feedFilterPopover.column ? (
                  <div key={index} className="playground-feed-nested-chip">
                    <span title={describeFilterNode(relation, { table: (table) => tableLabelByKey[table] ?? table })}>
                      {describeFilterNode(relation, { table: (table) => tableLabelByKey[table] ?? table })}
                    </span>
                    <button type="button" aria-label="Remover filtro aninhado" onClick={() => removeRelationFilterAt(index)}>
                      ×
                    </button>
                  </div>
                ) : null
              )}

              {nestedFilterOpen ? (
                <div className="playground-feed-nested-builder">
                  <RelationWhereBuilder
                    table={activeFeedFilterRelation.table}
                    value={nestedFilterDraft}
                    onChange={setNestedFilterDraft}
                    getColumns={(table) => relationCache[table]?.header ?? []}
                    getRelations={(table) => RELATION_BY_SHEET_COLUMN[table] ?? {}}
                    ensureTableLoaded={(table) => void ensureFeedRelationLoaded(table)}
                    tableLabel={(table) => tableLabelByKey[table] ?? table}
                    testIdPrefix={`playground-feed-nested-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
                  />
                  <button
                    type="button"
                    className="sheet-filter-apply-btn"
                    data-testid={`playground-feed-nested-add-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
                    onClick={addNestedRelationFilter}
                  >
                    Adicionar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`playground-feed-nested-open-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
                  onClick={openNestedFilterBuilder}
                >
                  + Filtro aninhado em {tableLabelByKey[activeFeedFilterRelation.table] ?? activeFeedFilterRelation.table}
                </button>
              )}
            </div>
          ) : null}

          <div className="sheet-filter-bulk-actions" role="tablist">
            <button
              type="button"
              className={`sheet-filter-clear-btn ${feedFilterMode === "include" ? "is-active" : ""}`.trim()}
              data-testid={`playground-feed-filter-mode-include-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={() => setFeedFilterMode("include")}
            >
              Incluir
            </button>
            <button
              type="button"
              className={`sheet-filter-clear-btn ${feedFilterMode === "exclude" ? "is-active" : ""}`.trim()}
              data-testid={`playground-feed-filter-mode-exclude-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={() => setFeedFilterMode("exclude")}
            >
              Todos exceto
            </button>
            <button
              type="button"
              className={`sheet-filter-clear-btn ${feedFilterMode === "math" ? "is-active" : ""}`.trim()}
              data-testid={`playground-feed-filter-mode-math-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onClick={() => setFeedFilterMode("math")}
            >
              Matemático
            </button>
          </div>

          {feedFilterMode === "exclude" ? (
            <p style={{ margin: "0 0 6px", fontSize: "0.76rem", color: "#657893" }}>
              Marque os valores que NAO serao filtrados (todos exceto esses).
            </p>
          ) : null}

          {feedFilterMode === "math" ? (
            <div className="sheet-filter-math" style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0" }}>
              <select
                value={feedFilterMathOp}
                aria-label="Operador matematico"
                data-testid={`playground-feed-filter-math-op-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
                onChange={(event) => setFeedFilterMathOp(event.target.value as ">" | ">=" | "<" | "<=" | "!=")}
              >
                <option value=">">maior que (&gt;)</option>
                <option value=">=">maior ou igual (&ge;)</option>
                <option value="<">menor que (&lt;)</option>
                <option value="<=">menor ou igual (&le;)</option>
                <option value="!=">diferente de (&ne;)</option>
              </select>
              <input
                value={feedFilterMathValue}
                placeholder="valor"
                aria-label="Valor de comparacao"
                data-testid={`playground-feed-filter-math-value-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
                onChange={(event) => setFeedFilterMathValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyFeedFilter();
                }}
              />
            </div>
          ) : (
            <>
          <label className="sheet-dialog-checkbox" style={{ fontSize: "0.76rem", margin: "0 0 4px", display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={feedFilterFullDomain}
              data-testid={`playground-feed-filter-full-domain-${feedFilterPopover.targetId}-${feedFilterPopover.column}`}
              onChange={(event) => setFeedFilterFullDomain(event.target.checked)}
            />
            <span>Todos os valores (ignora filtros atuais)</span>
          </label>
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
            </>
          )}
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

      {feedDialogOpen && configFilterPopover ? (
        <div
          className="sheet-filter-popover playground-config-filter-popover"
          data-testid={`playground-config-filter-popover-${configFilterPopover.column}`}
          style={{
            position: "fixed",
            top: configFilterPopover.top,
            left: configFilterPopover.left,
            maxHeight: configFilterPopover.maxHeight
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-filter-popover-head">
            <strong>{configFilterPopover.label}</strong>
            <div className="sheet-filter-popover-actions">
              <button type="button" className="sheet-filter-clear-btn" onClick={closeConfigFilterPopover}>
                Fechar
              </button>
            </div>
          </div>
          <input
            className="sheet-filter-search"
            placeholder="Buscar valor..."
            value={configFilterSearch}
            data-testid={`playground-config-filter-search-${configFilterPopover.column}`}
            onChange={(event) => setConfigFilterSearch(event.target.value)}
          />
          <div className="sheet-filter-bulk-actions">
            <button
              type="button"
              className="sheet-filter-clear-btn"
              data-testid={`playground-config-filter-select-all-${configFilterPopover.column}`}
              onClick={() =>
                setConfigFilterDraftValues((current) => {
                  const next = new Set(current);
                  for (const option of filteredConfigFilterOptions) {
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
              data-testid={`playground-config-filter-clear-selection-${configFilterPopover.column}`}
              onClick={() =>
                setConfigFilterDraftValues((current) => {
                  const blocked = new Set(filteredConfigFilterOptions.map((option) => option.literal));
                  return current.filter((value) => !blocked.has(value));
                })
              }
            >
              Desmarcar tudo
            </button>
          </div>
          <div className="sheet-filter-options">
            {configFilterLoading ? (
              <p>Carregando valores...</p>
            ) : filteredConfigFilterOptions.length === 0 ? (
              <p>Sem valores para este filtro.</p>
            ) : (
              filteredConfigFilterOptions.map((option) => {
                const checked = configFilterDraftValues.includes(option.literal);
                return (
                  <label key={option.literal} className="sheet-filter-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      data-testid={`playground-config-filter-option-${configFilterPopover.column}-${toTestIdFragment(option.literal)}`}
                      onChange={() => toggleConfigFilterDraftValue(option.literal)}
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
              data-testid={`playground-config-filter-clear-${configFilterPopover.column}`}
              onClick={clearConfigFilter}
            >
              Limpar
            </button>
            <button
              type="button"
              className="sheet-filter-apply-btn"
              data-testid={`playground-config-filter-apply-${configFilterPopover.column}`}
              onClick={applyConfigFilter}
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
                <strong>{fragmentDialog.editFragmentId ? "Editar valores do fragmento" : "Fragmentar alimentador"}</strong>
                <p>
                  {fragmentDialog.editFragmentId
                    ? "Adicione ou remova valores cobertos por este fragmento. O alimentador pai ajusta a exclusao automaticamente."
                    : "Por valor: cria areas filhas por valor (o pai exibe so os nao fragmentados). Por nº de linhas: quebra o alimentador em blocos de N linhas."}
                </p>
              </div>
              <button type="button" className="sheet-filter-clear-btn" onClick={() => setFragmentDialog(null)}>
                Fechar
              </button>
            </div>
            <div className="sheet-focus-dialog-body">
              {fragmentDialog.editFragmentId ? null : (
              <div className="sheet-filter-bulk-actions" role="tablist">
                <button
                  type="button"
                  className={`sheet-filter-clear-btn ${fragmentDialog.fragmentMode === "value" ? "is-active" : ""}`.trim()}
                  data-testid={`playground-fragment-mode-value-${fragmentDialog.feedId}`}
                  onClick={() => setFragmentDialog((current) => (current ? { ...current, fragmentMode: "value" } : current))}
                >
                  Por valor
                </button>
                <button
                  type="button"
                  className={`sheet-filter-clear-btn ${fragmentDialog.fragmentMode === "rows" ? "is-active" : ""}`.trim()}
                  data-testid={`playground-fragment-mode-rows-${fragmentDialog.feedId}`}
                  onClick={() => setFragmentDialog((current) => (current ? { ...current, fragmentMode: "rows" } : current))}
                >
                  Por nº de linhas
                </button>
              </div>
              )}

              {fragmentDialog.fragmentMode === "rows" ? (
                <section className="sheet-dialog-section">
                  <label className="sheet-form-field">
                    <span>Linhas por bloco</span>
                    <input
                      type="number"
                      min={1}
                      value={fragmentDialog.rowsPerBlock}
                      data-testid={`playground-fragment-rows-${fragmentDialog.feedId}`}
                      onChange={(event) =>
                        setFragmentDialog((current) =>
                          current ? { ...current, rowsPerBlock: Math.max(1, Math.floor(Number(event.target.value) || 0)) } : current
                        )
                      }
                    />
                  </label>
                  <p style={{ color: "#657893", fontSize: "0.8rem", margin: "6px 0 0" }}>
                    {(() => {
                      const summaryRecord = feedDataByTargetId[fragmentDialog.feedId];
                      const total = summaryRecord?.totalRows ?? summaryRecord?.rows.length ?? 0;
                      const perBlock = Math.max(1, Math.floor(fragmentDialog.rowsPerBlock || 0));
                      const blocks = total > 0 ? Math.ceil(total / perBlock) : 0;
                      return total > 0
                        ? `${total} linha(s) -> ${blocks} bloco(s) de ate ${perBlock}. O alimentador original sera ocultado.`
                        : "Atualize o alimentador para saber o total de linhas.";
                    })()}
                  </p>
                </section>
              ) : (
                <>
              <section className="sheet-dialog-section playground-fragment-picker">
                <label>
                  <span>Coluna</span>
                  <select
                    value={fragmentDialog.sourceColumn}
                    data-testid={`playground-fragment-column-${fragmentDialog.feedId}`}
                    disabled={Boolean(fragmentDialog.editFragmentId)}
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

              {fragmentDialog.editFragmentId ? null : (
                <>
              <div className="sheet-filter-bulk-actions" role="tablist">
                <button
                  type="button"
                  className={`sheet-filter-clear-btn ${fragmentDialog.selectionMode === "include" ? "is-active" : ""}`.trim()}
                  data-testid={`playground-fragment-selection-include-${fragmentDialog.feedId}`}
                  onClick={() => setFragmentDialog((current) => (current ? { ...current, selectionMode: "include" } : current))}
                >
                  Selecionados
                </button>
                <button
                  type="button"
                  className={`sheet-filter-clear-btn ${fragmentDialog.selectionMode === "except" ? "is-active" : ""}`.trim()}
                  data-testid={`playground-fragment-selection-except-${fragmentDialog.feedId}`}
                  onClick={() => setFragmentDialog((current) => (current ? { ...current, selectionMode: "except" } : current))}
                >
                  Todos exceto
                </button>
              </div>
              {fragmentDialog.selectionMode === "except" ? (
                <p className="playground-fragment-hint" style={{ margin: "0 0 4px", color: "#657893", fontSize: "0.78rem" }}>
                  Marque os valores que NAO devem virar fragmento. Todos os demais serao fragmentados.
                </p>
              ) : null}
                </>
              )}

              {fragmentDialog.editFragmentId ? null : (
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
              )}

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
                </>
              )}

              <div className="sheet-filter-footer">
                <button type="button" className="sheet-filter-clear-btn" onClick={() => setFragmentDialog(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="sheet-filter-apply-btn"
                  data-testid={`playground-fragment-apply-${fragmentDialog.feedId}`}
                  onClick={
                    fragmentDialog.editFragmentId
                      ? applyFragmentValueEdit
                      : fragmentDialog.fragmentMode === "rows"
                        ? applyRowSliceFragments
                        : applyFragmentDialog
                  }
                  disabled={
                    fragmentDialog.editFragmentId
                      ? fragmentDialog.selectedLiterals.length === 0
                      : fragmentDialog.fragmentMode === "rows"
                        ? fragmentDialog.rowsPerBlock < 1
                        : fragmentDialog.selectionMode === "include" && fragmentDialog.selectedLiterals.length === 0
                  }
                >
                  {fragmentDialog.editFragmentId
                    ? "Salvar valores"
                    : fragmentDialog.fragmentMode === "rows"
                      ? "Quebrar em blocos"
                      : fragmentDialog.groupSelected
                        ? "Criar fragmento agrupado"
                        : "Criar fragmentos"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {feedDialogOpen && feedActionPopover ? (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1190 }}
            onClick={() => setFeedActionPopover(null)}
            aria-hidden="true"
          />
          <div
            className="sheet-filter-popover playground-feed-action-popover"
            data-testid={`playground-feed-action-popover-${feedActionPopover.feedId}`}
            style={{
              position: "fixed",
              top: feedActionPopover.top,
              left: feedActionPopover.left,
              zIndex: 1200,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 184
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setFeedActionPopover(null);
            }}
          >
            <button
              type="button"
              className="sheet-filter-clear-btn"
              autoFocus
              data-testid={`playground-feed-action-duplicate-${feedActionPopover.feedId}`}
              onClick={() => {
                duplicateFeed(feedActionPopover.feedId);
                setFeedActionPopover(null);
              }}
            >
              Duplicar alimentador
            </button>
            <button type="button" className="sheet-filter-clear-btn" onClick={() => setFeedActionPopover(null)}>
              Fechar
            </button>
          </div>
        </>
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
                  <div className="playground-feed-hub-sidebar-head">
                    <strong>Alimentadores</strong>
                    <div className="sheet-dialog-section-actions">
                      <button
                        type="button"
                        className="sheet-filter-clear-btn"
                        onClick={startNewFeed}
                        disabled={feedTableOptions.length === 0}
                        title="Novo alimentador"
                      >
                        + Novo
                      </button>
                    </div>
                  </div>

                  {activePage.feeds.length === 0 ? (
                    <p className="playground-empty-copy">Nenhum alimentador nesta pagina.</p>
                  ) : (
                    <div className="playground-feed-hub-tree" role="tree">
                      {activePage.feeds.map((feed) => {
                        const isFeedActive =
                          feedHubSelectedId === feed.id && !feedHubFragmentId;
                        const feedExpanded =
                          feedHubSelectedId === feed.id || feed.fragments.length > 0;

                        return (
                          <div key={feed.id} className="playground-feed-tree-node" role="treeitem">
                            <div className="playground-feed-tree-row-wrapper">
                              <button
                                type="button"
                                className={`playground-feed-tree-row is-feed ${isFeedActive ? "is-active" : ""} ${feed.hidden ? "is-hidden" : ""}`.trim()}
                                data-testid={`playground-feed-hub-card-${feed.id}`}
                                onClick={() => {
                                  setFeedHubFragmentId(null);
                                  selectHubFeed(feed);
                                }}
                                title={feed.title?.trim() || tableLabelByKey[feed.table] || feed.table}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9A1.5 1.5 0 0 1 20.5 9.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
                                </svg>
                                <span className="playground-feed-tree-row-label">
                                  {feed.title?.trim() || tableLabelByKey[feed.table] || feed.table}
                                  {feed.hidden ? <span className="playground-feed-tree-row-tag"> (oculto)</span> : null}
                                </span>
                              </button>
                              {feed.hidden ? (
                                <button
                                  type="button"
                                  className="playground-feed-tree-row-action"
                                  data-testid={`playground-feed-hub-reactivate-${feed.id}`}
                                  onClick={() => showFeed(feed.id)}
                                  title="Reativar alimentador"
                                  aria-label={`Reativar ${feed.title?.trim() || feed.table}`}
                                >
                                  Reativar
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="playground-feed-tree-row-action playground-feed-tree-row-add"
                                data-testid={`playground-feed-hub-actions-${feed.id}`}
                                aria-label={`Acoes de ${feed.title?.trim() || feed.table}`}
                                title="Acoes do alimentador"
                                onClick={(event) => {
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  setFeedActionPopover((current) =>
                                    current?.feedId === feed.id ? null : { feedId: feed.id, top: rect.bottom + 4, left: rect.left }
                                  );
                                }}
                              >
                                +
                              </button>
                            </div>

                            {feedExpanded && feed.fragments.length > 0 ? (
                              <div className="playground-feed-tree-children" role="group">
                                {feed.fragments.map((fragment) => {
                                  const isFragmentActive =
                                    feedHubSelectedId === feed.id && feedHubFragmentId === fragment.id;
                                  return (
                                    <button
                                      key={fragment.id}
                                      type="button"
                                      className={`playground-feed-tree-row is-fragment ${isFragmentActive ? "is-active" : ""}`.trim()}
                                      data-testid={`playground-feed-hub-fragment-${fragment.id}`}
                                      onClick={() => {
                                        if (feedHubSelectedId !== feed.id) {
                                          selectHubFeed(feed);
                                        }
                                        setFeedHubFragmentId(fragment.id);
                                      }}
                                      title={`${fragment.valueLabel} (${feed.columnLabels[fragment.sourceColumn] ?? fragment.sourceColumn})`}
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M6 3h7l5 5v13H6z" />
                                        <path d="M13 3v5h5" />
                                      </svg>
                                      <span className="playground-feed-tree-row-label">{fragment.valueLabel}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </aside>

                <section className="playground-feed-hub-detail">
                  {feedTableOptions.length === 0 ? (
                    <p className="playground-empty-copy">Seu perfil nao possui tabelas disponiveis para novos alimentadores.</p>
                  ) : currentEditingFragment && currentEditingFeed ? (
                    <div className="playground-feed-hub-panel" data-testid="playground-feed-hub-fragment-panel">
                      <div className="sheet-dialog-section-head">
                        <div>
                          <strong>Configurar fragmento</strong>
                          <span>
                            Fragmento de <em>{currentEditingFeed.title?.trim() || tableLabelByKey[currentEditingFeed.table] || currentEditingFeed.table}</em>.
                            Ative/desative colunas e ajuste rotulos somente neste fragmento.
                          </span>
                        </div>
                        <div className="sheet-dialog-section-actions">
                          <button
                            type="button"
                            className="sheet-filter-clear-btn"
                            data-testid="playground-fragment-locate"
                            onClick={() => {
                              scrollGridToPosition(currentEditingFragment.position.row, currentEditingFragment.position.col);
                              closeFeedDialog();
                            }}
                          >
                            Localizar
                          </button>
                          <button
                            type="button"
                            className="sheet-filter-clear-btn"
                            data-testid="playground-fragment-back-to-feed"
                            onClick={() => setFeedHubFragmentId(null)}
                          >
                            Voltar ao alimentador
                          </button>
                          {currentEditingFragment.kind !== "rows" && currentEditingFragment.sourceColumn ? (
                            <button
                              type="button"
                              className="sheet-filter-clear-btn"
                              data-testid={`playground-fragment-edit-values-${currentEditingFragment.id}`}
                              onClick={() => openFragmentValueEditor(currentEditingFeed.id, currentEditingFragment)}
                            >
                              Editar valores
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="sheet-filter-clear-btn"
                            data-testid="playground-fragment-remove"
                            onClick={() => {
                              removeFragmentTarget(currentEditingFragment.id);
                            }}
                          >
                            Remover fragmento
                          </button>
                        </div>
                      </div>
                      <div className="sheet-dialog-grid">
                        <div className="playground-toolbar-chip playground-toolbar-chip-soft">
                          <span>Coluna fonte</span>
                          <strong>{currentEditingFeed.columnLabels[currentEditingFragment.sourceColumn] ?? currentEditingFragment.sourceColumn}</strong>
                        </div>
                        <div className="playground-toolbar-chip playground-toolbar-chip-soft">
                          <span>Valor</span>
                          <strong>{currentEditingFragment.valueLiteral || "(vazio)"}</strong>
                        </div>
                        <div className="playground-toolbar-chip playground-toolbar-chip-soft">
                          <span>Posicao</span>
                          <strong>{formatCellAddress(currentEditingFragment.position.row, currentEditingFragment.position.col)}</strong>
                        </div>
                      </div>

                      <section className="sheet-dialog-section playground-feed-hub-subsection">
                        <div className="sheet-dialog-section-head">
                          <div>
                            <strong>Identidade</strong>
                            <span>Renomeie o fragmento como ele deve aparecer no grid e nos rotulos.</span>
                          </div>
                        </div>
                        <label className="sheet-form-field">
                          <span>Nome do fragmento</span>
                          <input
                            type="text"
                            value={currentEditingFragment.valueLabel}
                            data-testid={`playground-feed-fragment-title-${currentEditingFragment.id}`}
                            onChange={(event) => updateHubFragmentLabel(event.target.value)}
                          />
                        </label>
                      </section>

                      <section className="sheet-dialog-section playground-feed-hub-subsection">
                        <div className="sheet-dialog-section-head">
                          <div>
                            <strong>Colunas do fragmento</strong>
                            <span>
                              As colunas nao marcadas ficam ocultas apenas neste fragmento. O alimentador
                              pai continua mostrando todas.
                            </span>
                          </div>
                        </div>
                        <div className="sheet-order-list">
                          {[
                            ...activeHubFragmentColumns,
                            ...currentEditingFeed.columns.filter((column) => !activeHubFragmentColumns.includes(column))
                          ].map((column) => {
                            const enabled = activeHubFragmentColumns.includes(column);
                            const customLabel = activeHubFragmentLabels[column] ?? currentEditingFeed.columnLabels[column] ?? column;
                            const relation = RELATION_BY_SHEET_COLUMN[currentEditingFeed.table]?.[column];
                            const ownDisplayOverride = currentEditingFragment.displayColumnOverrides[column];
                            const inheritedDisplayOverride = currentEditingFeed.displayColumnOverrides[column];
                            const effectiveDisplayOverride = ownDisplayOverride ?? inheritedDisplayOverride;

                            return (
                              <div key={`fragment-config-column-${currentEditingFragment.id}-${column}`} className="sheet-order-item">
                                <div className="sheet-print-column-main">
                                  <label className="sheet-dialog-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={enabled}
                                      data-testid={`playground-feed-fragment-column-toggle-${currentEditingFragment.id}-${column}`}
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
                                      data-testid={`playground-feed-fragment-column-label-${currentEditingFragment.id}-${column}`}
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
                                      data-testid={`playground-feed-fragment-relation-expand-${currentEditingFragment.id}-${column}`}
                                      onClick={() => openHubFragmentRelationDialog(column)}
                                    >
                                      Expandir FK
                                    </button>
                                  ) : null}
                                  {ownDisplayOverride ? (
                                    <button
                                      type="button"
                                      className="sheet-filter-clear-btn"
                                      data-testid={`playground-feed-fragment-relation-clear-${currentEditingFragment.id}-${column}`}
                                      onClick={() => clearFeedTargetDisplayOverride(currentEditingFragment.id, column)}
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
                      </section>
                    </div>
                  ) : (
                    <div className="playground-feed-hub-panel">
                      <div className="sheet-dialog-section-head">
                        <div>
                          <strong>{currentEditingFeed ? "Configurar alimentador" : "Novo alimentador"}</strong>
                          <span>Renomeie, altere tabela, colunas, destino e fragmentos.</span>
                        </div>
                        {currentEditingFeed ? (
                          <div className="sheet-dialog-section-actions">
                            <button
                              type="button"
                              className="sheet-filter-clear-btn"
                              data-testid="playground-feed-locate"
                              onClick={() => {
                                const fragment = feedHubFragmentId
                                  ? currentEditingFeed.fragments.find((entry) => entry.id === feedHubFragmentId)
                                  : null;
                                const target = fragment?.position ?? currentEditingFeed.position;
                                scrollGridToPosition(target.row, target.col);
                                closeFeedDialog();
                              }}
                            >
                              Localizar
                            </button>
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
                          <label className="sheet-dialog-checkbox playground-feed-render-toggle">
                            <input
                              type="checkbox"
                              checked={feedHideColumnHeader}
                              data-testid="playground-feed-hide-column-header-toggle"
                              onChange={(event) => setFeedHideColumnHeader(event.target.checked)}
                            />
                            <span>Ocultar indices</span>
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
                            <strong>Colunas</strong>
                            <span>Ative as colunas, renomeie o cabecalho, ajuste a ordem e defina filtros fixos.</span>
                          </div>
                          <div className="sheet-dialog-section-actions">
                            <button
                              type="button"
                              className="sheet-filter-clear-btn"
                              onClick={() => {
                                setFeedColumns((current) => {
                                  const prochOnly = current.filter((column) => column.startsWith("__proch__:"));
                                  return [...activeColumns, ...prochOnly];
                                });
                                setFeedColumnLabels((current) => {
                                  const next = activeColumns.reduce<Record<string, string>>((acc, column) => {
                                    acc[column] = current[column] ?? column;
                                    return acc;
                                  }, {});
                                  // Preserva labels das colunas PROCH.
                                  for (const [column, label] of Object.entries(current)) {
                                    if (column.startsWith("__proch__:")) next[column] = label;
                                  }
                                  return next;
                                });
                              }}
                              disabled={activeColumns.length === 0}
                            >
                              Selecionar tudo
                            </button>
                            <button
                              type="button"
                              className="sheet-filter-clear-btn"
                              onClick={() =>
                                setFeedColumns((current) => current.filter((column) => column.startsWith("__proch__:")))
                              }
                            >
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
                              const filterExpression = feedFilterDrafts[column] ?? "";
                              const filterActive = filterExpression.trim().length > 0;
                              const filterTestId = currentEditingFeed
                                ? `playground-config-filter-trigger-${currentEditingFeed.id}-${column}`
                                : `playground-config-filter-trigger-new-${column}`;

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
                                      {filterActive ? (
                                        <span title={describeFeedFilterExpression(filterExpression.trim())}>
                                          Filtro: {describeFeedFilterExpression(filterExpression.trim())}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="sheet-order-actions">
                                    <button
                                      type="button"
                                      className={`sheet-filter-trigger ${filterActive ? "is-active" : ""}`}
                                      title={filterActive ? "Editar filtro" : "Filtrar valores"}
                                      aria-label={`Filtrar coluna ${customLabel || column}`}
                                      data-testid={filterTestId}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        openConfigFilterPopover(column, customLabel.trim() || column, rect);
                                      }}
                                    >
                                      <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
                                      </svg>
                                    </button>
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

                      <section className="sheet-dialog-section playground-feed-hub-subsection" data-testid="playground-feed-proch-section">
                        <div className="sheet-dialog-section-head">
                          <div>
                            <strong>Colunas PROCH (correspondencia horizontal)</strong>
                            <span>
                              Procura a chave de cada linha do alimentador na coluna correspondente
                              de outra tabela e mostra o valor da coluna que voce escolher.
                            </span>
                          </div>
                          <div className="sheet-dialog-section-actions">
                            <button
                              type="button"
                              className="sheet-filter-clear-btn"
                              onClick={() => addProchColumnDraft()}
                              disabled={activeColumns.length === 0 || feedTableOptions.length === 0}
                              data-testid="playground-feed-proch-add"
                            >
                              + Adicionar PROCH
                            </button>
                          </div>
                        </div>

                        {feedProchColumns.length === 0 ? (
                          <p className="playground-empty-copy">
                            Nenhuma coluna PROCH definida. Clique em &quot;+ Adicionar PROCH&quot; para criar uma.
                          </p>
                        ) : (
                          <div className="sheet-order-list">
                            {feedProchColumns.map((proch) => {
                              const lookupColumns = tableColumnsByKey[proch.lookupTable] ?? [];
                              const isLoadingLookup = loadingColumnsFor === proch.lookupTable;
                              const ready =
                                proch.localKeyColumn &&
                                proch.lookupTable &&
                                proch.lookupKeyColumn &&
                                proch.lookupValueColumn;
                              return (
                                <div
                                  key={proch.id}
                                  className="sheet-order-item playground-proch-row"
                                  data-testid={`playground-feed-proch-row-${proch.id}`}
                                >
                                  <div className="sheet-print-column-main playground-proch-grid">
                                    <label className="sheet-form-field">
                                      <span>Nome da coluna</span>
                                      <input
                                        type="text"
                                        value={proch.label}
                                        onChange={(event) => updateProchColumn(proch.id, { label: event.target.value })}
                                        data-testid={`playground-feed-proch-label-${proch.id}`}
                                      />
                                    </label>
                                    <label className="sheet-form-field">
                                      <span>Chave no alimentador</span>
                                      <select
                                        value={proch.localKeyColumn}
                                        onChange={(event) =>
                                          updateProchColumn(proch.id, { localKeyColumn: event.target.value })
                                        }
                                        data-testid={`playground-feed-proch-local-key-${proch.id}`}
                                      >
                                        <option value="">Selecione...</option>
                                        {activeColumns.map((column) => (
                                          <option key={`local-${proch.id}-${column}`} value={column}>
                                            {column}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="sheet-form-field">
                                      <span>Tabela alvo</span>
                                      <select
                                        value={proch.lookupTable}
                                        onChange={(event) => {
                                          const nextTable = event.target.value as SheetKey;
                                          updateProchColumn(proch.id, {
                                            lookupTable: nextTable,
                                            lookupKeyColumn: "",
                                            lookupValueColumn: ""
                                          });
                                          if (nextTable && !tableColumnsByKey[nextTable]) {
                                            void loadTableColumns(nextTable);
                                          }
                                        }}
                                        data-testid={`playground-feed-proch-table-${proch.id}`}
                                      >
                                        <option value="">Selecione...</option>
                                        {feedTableOptions.map((option) => (
                                          <option key={`tbl-${proch.id}-${option.key}`} value={option.key}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="sheet-form-field">
                                      <span>Chave correspondente na tabela alvo</span>
                                      <select
                                        value={proch.lookupKeyColumn}
                                        onChange={(event) =>
                                          updateProchColumn(proch.id, { lookupKeyColumn: event.target.value })
                                        }
                                        disabled={isLoadingLookup || lookupColumns.length === 0}
                                        data-testid={`playground-feed-proch-lookup-key-${proch.id}`}
                                      >
                                        <option value="">
                                          {isLoadingLookup ? "Carregando..." : "Selecione..."}
                                        </option>
                                        {lookupColumns.map((column) => (
                                          <option key={`lk-${proch.id}-${column}`} value={column}>
                                            {column}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="sheet-form-field">
                                      <span>Coluna a puxar</span>
                                      <select
                                        value={proch.lookupValueColumn}
                                        onChange={(event) =>
                                          updateProchColumn(proch.id, { lookupValueColumn: event.target.value })
                                        }
                                        disabled={isLoadingLookup || lookupColumns.length === 0}
                                        data-testid={`playground-feed-proch-lookup-value-${proch.id}`}
                                      >
                                        <option value="">
                                          {isLoadingLookup ? "Carregando..." : "Selecione..."}
                                        </option>
                                        {lookupColumns.map((column) => (
                                          <option key={`lv-${proch.id}-${column}`} value={column}>
                                            {column}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <div className="sheet-print-column-meta">
                                      <span>
                                        {ready
                                          ? `${proch.lookupTable}.${proch.lookupValueColumn} ⇐ chave ${proch.localKeyColumn}`
                                          : "Preencha todos os campos para ativar."}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="sheet-order-actions">
                                    <button
                                      type="button"
                                      className="sheet-order-btn"
                                      onClick={() => removeProchColumn(proch.id)}
                                      data-testid={`playground-feed-proch-remove-${proch.id}`}
                                      title="Remover coluna PROCH"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

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
