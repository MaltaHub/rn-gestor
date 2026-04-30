import { cellKey } from "@/components/playground/grid-utils";
import type { GridPosition, GridRect, PlaygroundCell, PlaygroundPage } from "@/components/playground/types";

export type PlaygroundAreaKind = "feed" | "fragment";

export type PlaygroundArea = {
  id: string;
  kind: PlaygroundAreaKind;
  origin: GridPosition;
  size: {
    rows: number;
    cols: number;
  };
  ownerId?: string;
};

export type AreaResizeMode = "fixed" | "shift-range";

export type AreaColumnRange = {
  startCol: number;
  endCol: number;
};

export type AreaMovedCell = {
  from: GridPosition;
  to: GridPosition;
  key: string;
};

export type AreaRemovedCell = {
  position: GridPosition;
  key: string;
};

export type AreaMovedArea = {
  areaId: string;
  from: GridPosition;
  to: GridPosition;
  partiallyIntersectsColumns: boolean;
};

export type AreaResizeConflict = {
  kind: "area_collision" | "resize_boundary_crossed";
  areaIds: string[];
  message: string;
};

export type AreaResizePlan = {
  areaId: string;
  mode: AreaResizeMode;
  oldRect: GridRect;
  newRect: GridRect;
  deltaRows: number;
  affectedColumns: AreaColumnRange;
  movedCells: AreaMovedCell[];
  removedCells: AreaRemovedCell[];
  movedAreas: AreaMovedArea[];
  conflicts: AreaResizeConflict[];
  safeToApply: boolean;
};

type AreaWithRect = {
  area: PlaygroundArea;
  rect: GridRect;
};

function clampSize(value: number) {
  return Math.max(1, Math.round(value));
}

function normalizeArea(area: PlaygroundArea): PlaygroundArea {
  return {
    ...area,
    origin: {
      row: Math.max(0, Math.round(area.origin.row)),
      col: Math.max(0, Math.round(area.origin.col))
    },
    size: {
      rows: clampSize(area.size.rows),
      cols: clampSize(area.size.cols)
    }
  };
}

export function buildAreaRect(area: PlaygroundArea): GridRect {
  const normalized = normalizeArea(area);

  return {
    row: normalized.origin.row,
    col: normalized.origin.col,
    rowSpan: normalized.size.rows,
    colSpan: normalized.size.cols
  };
}

function rectBottom(rect: GridRect) {
  return rect.row + rect.rowSpan;
}

function rectRight(rect: GridRect) {
  return rect.col + rect.colSpan;
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function rectsOverlap(left: GridRect, right: GridRect) {
  return left.row < rectBottom(right) && rectBottom(left) > right.row && left.col < rectRight(right) && rectRight(left) > right.col;
}

function rectIntersectsColumns(rect: GridRect, range: AreaColumnRange) {
  return rangesOverlap(rect.col, rectRight(rect) - 1, range.startCol, range.endCol);
}

function rectPartiallyIntersectsColumns(rect: GridRect, range: AreaColumnRange) {
  if (!rectIntersectsColumns(rect, range)) return false;
  return rect.col < range.startCol || rectRight(rect) - 1 > range.endCol;
}

function getAffectedColumns(rect: GridRect): AreaColumnRange {
  return {
    startCol: rect.col,
    endCol: rectRight(rect) - 1
  };
}

function parseCellKey(key: string): GridPosition | null {
  const [rowRaw, colRaw] = key.split(":");
  const row = Number(rowRaw);
  const col = Number(colRaw);

  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) {
    return null;
  }

  return { row, col };
}

function movePosition(position: GridPosition, deltaRows: number): GridPosition {
  return {
    row: Math.max(0, position.row + deltaRows),
    col: position.col
  };
}

function buildMovedCells(page: PlaygroundPage, oldRect: GridRect, newRect: GridRect, mode: AreaResizeMode) {
  const deltaRows = newRect.rowSpan - oldRect.rowSpan;
  if (mode === "fixed" || deltaRows === 0) return [];

  const affectedColumns = getAffectedColumns(oldRect);
  const movementStartRow = rectBottom(oldRect);

  return Object.keys(page.cells)
    .map((key): AreaMovedCell | null => {
      const position = parseCellKey(key);
      if (!position) return null;
      if (position.row < movementStartRow) return null;
      if (position.col < affectedColumns.startCol || position.col > affectedColumns.endCol) return null;

      return {
        key,
        from: position,
        to: movePosition(position, deltaRows)
      };
    })
    .filter((entry): entry is AreaMovedCell => Boolean(entry));
}

function buildRemovedCells(page: PlaygroundPage, oldRect: GridRect, newRect: GridRect, mode: AreaResizeMode) {
  const deltaRows = newRect.rowSpan - oldRect.rowSpan;
  if (mode === "fixed" || deltaRows >= 0) return [];

  const affectedColumns = getAffectedColumns(oldRect);
  const removedStartRow = rectBottom(newRect);
  const removedEndRow = rectBottom(oldRect) - 1;

  return Object.keys(page.cells)
    .map((key): AreaRemovedCell | null => {
      const position = parseCellKey(key);
      if (!position) return null;
      if (position.row < removedStartRow || position.row > removedEndRow) return null;
      if (position.col < affectedColumns.startCol || position.col > affectedColumns.endCol) return null;

      return {
        key,
        position
      };
    })
    .filter((entry): entry is AreaRemovedCell => Boolean(entry));
}

function buildMovedAreas(params: {
  areas: PlaygroundArea[];
  areaId: string;
  oldRect: GridRect;
  newRect: GridRect;
  mode: AreaResizeMode;
}) {
  const deltaRows = params.newRect.rowSpan - params.oldRect.rowSpan;
  if (params.mode === "fixed" || deltaRows === 0) return [];

  const affectedColumns = getAffectedColumns(params.oldRect);
  const movementStartRow = rectBottom(params.oldRect);

  return params.areas
    .filter((area) => area.id !== params.areaId)
    .map((area): AreaMovedArea | null => {
      const rect = buildAreaRect(area);
      if (rect.row < movementStartRow) return null;
      if (!rectIntersectsColumns(rect, affectedColumns)) return null;

      return {
        areaId: area.id,
        from: area.origin,
        to: movePosition(area.origin, deltaRows),
        partiallyIntersectsColumns: rectPartiallyIntersectsColumns(rect, affectedColumns)
      };
    })
    .filter((entry): entry is AreaMovedArea => Boolean(entry));
}

function buildBoundaryConflicts(params: {
  areas: PlaygroundArea[];
  areaId: string;
  oldRect: GridRect;
  mode: AreaResizeMode;
}) {
  if (params.mode === "fixed") return [];

  const affectedColumns = getAffectedColumns(params.oldRect);
  const movementStartRow = rectBottom(params.oldRect);

  return params.areas
    .filter((area) => area.id !== params.areaId)
    .map((area): AreaResizeConflict | null => {
      const rect = buildAreaRect(area);
      const crossesBottom = rect.row < movementStartRow && rectBottom(rect) > movementStartRow;
      if (!crossesBottom || !rectIntersectsColumns(rect, affectedColumns)) return null;

      return {
        kind: "resize_boundary_crossed",
        areaIds: [area.id],
        message: `A area ${area.id} cruza a borda de resize e precisa de acao manual.`
      };
    })
    .filter((entry): entry is AreaResizeConflict => Boolean(entry));
}

function buildCollisionConflicts(params: {
  areas: PlaygroundArea[];
  areaId: string;
  newRect: GridRect;
  movedAreas: AreaMovedArea[];
}) {
  const movedAreaById = new Map(params.movedAreas.map((entry) => [entry.areaId, entry]));
  const nextRects: AreaWithRect[] = params.areas.map((area) => {
    if (area.id === params.areaId) {
      return {
        area,
        rect: params.newRect
      };
    }

    const movedArea = movedAreaById.get(area.id);
    if (!movedArea) {
      return {
        area,
        rect: buildAreaRect(area)
      };
    }

    return {
      area,
      rect: buildAreaRect({
        ...area,
        origin: movedArea.to
      })
    };
  });
  const conflicts: AreaResizeConflict[] = [];

  for (let leftIndex = 0; leftIndex < nextRects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nextRects.length; rightIndex += 1) {
      const left = nextRects[leftIndex];
      const right = nextRects[rightIndex];

      if (rectsOverlap(left.rect, right.rect)) {
        conflicts.push({
          kind: "area_collision",
          areaIds: [left.area.id, right.area.id],
          message: `As areas ${left.area.id} e ${right.area.id} colidem apos o resize.`
        });
      }
    }
  }

  return conflicts;
}

export function calculateAreaResizePlan(params: {
  page: PlaygroundPage;
  areas: PlaygroundArea[];
  areaId: string;
  nextRows: number;
  mode: AreaResizeMode;
}): AreaResizePlan {
  const area = params.areas.find((entry) => entry.id === params.areaId);
  if (!area) {
    throw new Error(`Area ${params.areaId} nao encontrada.`);
  }

  const normalizedArea = normalizeArea(area);
  const oldRect = buildAreaRect(normalizedArea);
  const newRect = {
    ...oldRect,
    rowSpan: clampSize(params.nextRows)
  };
  const movedAreas = buildMovedAreas({
    areas: params.areas,
    areaId: params.areaId,
    oldRect,
    newRect,
    mode: params.mode
  });
  const conflicts = [
    ...buildBoundaryConflicts({
      areas: params.areas,
      areaId: params.areaId,
      oldRect,
      mode: params.mode
    }),
    ...buildCollisionConflicts({
      areas: params.areas,
      areaId: params.areaId,
      newRect,
      movedAreas
    })
  ];

  return {
    areaId: params.areaId,
    mode: params.mode,
    oldRect,
    newRect,
    deltaRows: newRect.rowSpan - oldRect.rowSpan,
    affectedColumns: getAffectedColumns(oldRect),
    movedCells: buildMovedCells(params.page, oldRect, newRect, params.mode),
    removedCells: buildRemovedCells(params.page, oldRect, newRect, params.mode),
    movedAreas,
    conflicts,
    safeToApply: conflicts.length === 0
  };
}

function movePageCells(page: PlaygroundPage, plan: AreaResizePlan) {
  const nextCells: Record<string, PlaygroundCell> = { ...page.cells };
  const originalCells = page.cells;

  for (const cell of plan.removedCells) {
    delete nextCells[cell.key];
  }

  for (const cell of plan.movedCells) {
    delete nextCells[cell.key];
  }

  for (const cell of plan.movedCells) {
    const value = originalCells[cell.key];
    if (value) {
      nextCells[cellKey(cell.to.row, cell.to.col)] = value;
    }
  }

  return nextCells;
}

function moveFeedPosition<T extends { id: string; position: GridPosition; renderedAt?: string }>(
  entry: T,
  movedAreaById: Map<string, AreaMovedArea>
) {
  const movedArea = movedAreaById.get(entry.id);
  if (!movedArea) return entry;

  return {
    ...entry,
    position: movedArea.to,
    renderedAt: new Date().toISOString()
  };
}

export function applyAreaResizePlan(page: PlaygroundPage, plan: AreaResizePlan): PlaygroundPage {
  if (!plan.safeToApply) {
    throw new Error("Nao e possivel aplicar um resize de area com conflitos.");
  }

  const movedAreaById = new Map(plan.movedAreas.map((entry) => [entry.areaId, entry]));
  const nextCells = movePageCells(page, plan);
  const feeds = page.feeds.map((feed) => {
    const movedFeed = moveFeedPosition(feed, movedAreaById);
    const movedArea = movedAreaById.get(feed.id);
    const nextFeed = movedArea
      ? {
          ...movedFeed,
          targetRow: movedArea.to.row,
          targetCol: movedArea.to.col
        }
      : movedFeed;

    return {
      ...nextFeed,
      fragments: nextFeed.fragments.map((fragment) => moveFeedPosition(fragment, movedAreaById))
    };
  });
  const maxMovedRow = Math.max(
    page.rowCount,
    plan.newRect.row + plan.newRect.rowSpan,
    ...plan.movedCells.map((cell) => cell.to.row + 1),
    ...plan.movedAreas.map((area) => area.to.row + 1)
  );

  return {
    ...page,
    rowCount: maxMovedRow,
    cells: nextCells,
    feeds,
    updatedAt: new Date().toISOString()
  };
}
