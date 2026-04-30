import type { GridPosition, GridRect } from "@/components/playground/types";
import {
  buildGridRect,
  getGridRectEnd,
  isGridRectWithinBounds,
  normalizeGridPosition,
  normalizeGridSize,
  type GridBounds,
  type GridSize
} from "@/components/playground/domain/geometry";

export type SnapPlacementOptions = {
  desiredPosition: GridPosition;
  size: GridSize;
  bounds: GridBounds;
  occupiedRects: GridRect[];
};

export function gridRectsOverlap(left: GridRect, right: GridRect) {
  const leftEnd = getGridRectEnd(left);
  const rightEnd = getGridRectEnd(right);

  return left.row <= rightEnd.row && leftEnd.row >= right.row && left.col <= rightEnd.col && leftEnd.col >= right.col;
}

export function findCollidingGridRect(candidate: GridRect, occupiedRects: GridRect[]) {
  return occupiedRects.find((rect) => gridRectsOverlap(candidate, rect)) ?? null;
}

export function isGridPlacementAvailable(candidate: GridRect, bounds: GridBounds, occupiedRects: GridRect[]) {
  return isGridRectWithinBounds(candidate, bounds) && !findCollidingGridRect(candidate, occupiedRects);
}

function compareSnapCandidates(origin: GridPosition, left: GridPosition, right: GridPosition) {
  const leftDistance = Math.abs(left.row - origin.row) + Math.abs(left.col - origin.col);
  const rightDistance = Math.abs(right.row - origin.row) + Math.abs(right.col - origin.col);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;

  const leftRowDistance = Math.abs(left.row - origin.row);
  const rightRowDistance = Math.abs(right.row - origin.row);
  if (leftRowDistance !== rightRowDistance) return leftRowDistance - rightRowDistance;

  if (left.row !== right.row) return left.row - right.row;
  return left.col - right.col;
}

export function findNearestAvailableGridPosition(options: SnapPlacementOptions): GridPosition | null {
  const desiredPosition = normalizeGridPosition(options.desiredPosition);
  const size = normalizeGridSize(options.size);
  const maxRow = options.bounds.rowCount - size.rowSpan;
  const maxCol = options.bounds.colCount - size.colSpan;

  if (maxRow < 0 || maxCol < 0) return null;

  const candidates: GridPosition[] = [];
  for (let row = 0; row <= maxRow; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
      candidates.push({ row, col });
    }
  }

  candidates.sort((left, right) => compareSnapCandidates(desiredPosition, left, right));

  for (const candidate of candidates) {
    const rect = buildGridRect(candidate, size);
    if (isGridPlacementAvailable(rect, options.bounds, options.occupiedRects)) {
      return candidate;
    }
  }

  return null;
}

