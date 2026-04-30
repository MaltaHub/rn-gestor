import type { GridPosition, GridRect } from "@/components/playground/types";

export type GridSize = {
  rowSpan: number;
  colSpan: number;
};

export type GridBounds = {
  rowCount: number;
  colCount: number;
};

export type GridPixelMetrics = {
  rowHeights: Record<string, number>;
  columnWidths: Record<string, number>;
  defaultRowHeight: number;
  defaultColumnWidth: number;
  rowHeaderWidth?: number;
  columnHeaderHeight?: number;
};

export function normalizeGridPosition(position: Partial<GridPosition> | null | undefined): GridPosition {
  const row = Number(position?.row ?? 0);
  const col = Number(position?.col ?? 0);

  return {
    row: Number.isFinite(row) ? Math.max(0, Math.round(row)) : 0,
    col: Number.isFinite(col) ? Math.max(0, Math.round(col)) : 0
  };
}

export function normalizeGridSize(size: Partial<GridSize> | null | undefined): GridSize {
  const rowSpan = Number(size?.rowSpan ?? 1);
  const colSpan = Number(size?.colSpan ?? 1);

  return {
    rowSpan: Number.isFinite(rowSpan) ? Math.max(1, Math.round(rowSpan)) : 1,
    colSpan: Number.isFinite(colSpan) ? Math.max(1, Math.round(colSpan)) : 1
  };
}

export function buildGridRect(position: GridPosition, size: GridSize): GridRect {
  const normalizedPosition = normalizeGridPosition(position);
  const normalizedSize = normalizeGridSize(size);

  return {
    row: normalizedPosition.row,
    col: normalizedPosition.col,
    rowSpan: normalizedSize.rowSpan,
    colSpan: normalizedSize.colSpan
  };
}

export function getGridRectEnd(rect: GridRect) {
  return {
    row: rect.row + rect.rowSpan - 1,
    col: rect.col + rect.colSpan - 1
  };
}

export function isGridRectWithinBounds(rect: GridRect, bounds: GridBounds) {
  if (rect.row < 0 || rect.col < 0) return false;
  if (rect.rowSpan < 1 || rect.colSpan < 1) return false;
  return rect.row + rect.rowSpan <= bounds.rowCount && rect.col + rect.colSpan <= bounds.colCount;
}

export function clampGridPositionForSize(position: GridPosition, size: GridSize, bounds: GridBounds): GridPosition {
  const normalizedSize = normalizeGridSize(size);
  const maxRow = Math.max(0, bounds.rowCount - normalizedSize.rowSpan);
  const maxCol = Math.max(0, bounds.colCount - normalizedSize.colSpan);
  const normalizedPosition = normalizeGridPosition(position);

  return {
    row: Math.min(maxRow, normalizedPosition.row),
    col: Math.min(maxCol, normalizedPosition.col)
  };
}

export function sumGridTrackSizes(trackSizes: Record<string, number>, defaultSize: number, start: number, endExclusive: number) {
  let total = 0;

  for (let index = Math.max(0, start); index < Math.max(start, endExclusive); index += 1) {
    const size = trackSizes[String(index)];
    total += Number.isFinite(size) && size > 0 ? size : defaultSize;
  }

  return total;
}

export function gridPositionToPixels(position: GridPosition, metrics: GridPixelMetrics) {
  const normalizedPosition = normalizeGridPosition(position);

  return {
    top: (metrics.columnHeaderHeight ?? 0) + sumGridTrackSizes(metrics.rowHeights, metrics.defaultRowHeight, 0, normalizedPosition.row),
    left: (metrics.rowHeaderWidth ?? 0) + sumGridTrackSizes(metrics.columnWidths, metrics.defaultColumnWidth, 0, normalizedPosition.col)
  };
}

export function gridRectToPixels(rect: GridRect, metrics: GridPixelMetrics) {
  const origin = gridPositionToPixels(rect, metrics);

  return {
    ...origin,
    width: sumGridTrackSizes(metrics.columnWidths, metrics.defaultColumnWidth, rect.col, rect.col + rect.colSpan),
    height: sumGridTrackSizes(metrics.rowHeights, metrics.defaultRowHeight, rect.row, rect.row + rect.rowSpan)
  };
}

