import type { GridFilters, GridListPayload, SheetKey, SortRule } from "@/components/ui-grid/types";
import { resolveDisplayValueFromLookup } from "@/components/ui-grid/core/grid-rules";
import {
  buildParentFeedQueryExcludingFragments,
  normalizeFeedQuery
} from "@/components/playground/domain/feed-query";
import {
  getFeedFragmentColumnLabels,
  getFeedFragmentColumns,
  getFeedFragmentDisplayColumnOverrides,
  getFragmentValueLiterals
} from "@/components/playground/domain/feed-fragments";
import type { GridPosition, PlaygroundCell, PlaygroundFeed, PlaygroundFeedFragment, PlaygroundFeedQuery } from "@/components/playground/types";

export type PlaygroundFeedDataTargetKind = "feed" | "fragment";

export type PlaygroundFeedDataTarget = {
  id: string;
  feedId: string;
  fragmentId?: string;
  kind: PlaygroundFeedDataTargetKind;
  table: SheetKey;
  title?: string;
  position: GridPosition;
  columns: string[];
  columnLabels: Record<string, string>;
  query: PlaygroundFeedQuery;
  displayColumnOverrides: Record<string, string>;
  lockedFilterColumns: string[];
};

export type PlaygroundFeedDataRecord = {
  targetId: string;
  requestKey: string;
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  status: "idle" | "loading" | "ready" | "error";
  loadedAt?: string;
  error?: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }

  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function normalizeFeedPosition(feed: PlaygroundFeed): GridPosition {
  return {
    row: Math.max(0, Math.round(feed.position?.row ?? feed.targetRow ?? 0)),
    col: Math.max(0, Math.round(feed.position?.col ?? feed.targetCol ?? 0))
  };
}

function normalizeFragmentPosition(fragment: PlaygroundFeedFragment): GridPosition {
  return {
    row: Math.max(0, Math.round(fragment.position?.row ?? 0)),
    col: Math.max(0, Math.round(fragment.position?.col ?? 0))
  };
}

export function buildParentFeedDataQuery(feed: PlaygroundFeed) {
  const fragmentsByColumn = new Map<string, string[]>();

  for (const fragment of feed.fragments) {
    const current = fragmentsByColumn.get(fragment.sourceColumn) ?? [];
    current.push(fragment.valueLiteral);
    fragmentsByColumn.set(fragment.sourceColumn, current);
  }

  let query = normalizeFeedQuery(feed.query);

  for (const [sourceColumn, valueLiterals] of fragmentsByColumn.entries()) {
    query = buildParentFeedQueryExcludingFragments({
      parentQuery: query,
      sourceColumn,
      valueLiterals
    });
  }

  return query;
}

function getParentLockedFilterColumns(feed: PlaygroundFeed) {
  return Array.from(new Set(feed.fragments.map((fragment) => fragment.sourceColumn)));
}

export function buildPlaygroundFeedDataTargets(feeds: PlaygroundFeed[]) {
  const targets: PlaygroundFeedDataTarget[] = [];

  for (const feed of feeds) {
    targets.push({
      id: feed.id,
      feedId: feed.id,
      kind: "feed",
      table: feed.table,
      title: feed.title,
      position: normalizeFeedPosition(feed),
      columns: feed.columns,
      columnLabels: feed.columnLabels,
      query: buildParentFeedDataQuery(feed),
      displayColumnOverrides: feed.displayColumnOverrides,
      lockedFilterColumns: getParentLockedFilterColumns(feed)
    });

    for (const fragment of feed.fragments) {
      targets.push({
        id: fragment.id,
        feedId: feed.id,
        fragmentId: fragment.id,
        kind: "fragment",
        table: feed.table,
        title: fragment.valueLabel,
        position: normalizeFragmentPosition(fragment),
        columns: getFeedFragmentColumns(feed, fragment),
        columnLabels: getFeedFragmentColumnLabels(feed, fragment),
        query: normalizeFeedQuery(fragment.query),
        displayColumnOverrides: getFeedFragmentDisplayColumnOverrides(feed, fragment),
        lockedFilterColumns: [fragment.sourceColumn]
      });
    }
  }

  return targets;
}

export function buildPlaygroundFeedRequestKey(target: PlaygroundFeedDataTarget) {
  return stableStringify({
    table: target.table,
    columns: target.columns,
    query: target.query
  });
}

export function buildPlaygroundFeedRequestParams(target: PlaygroundFeedDataTarget): {
  table: SheetKey;
  page: number;
  pageSize: number;
  query: string;
  matchMode: PlaygroundFeedQuery["matchMode"];
  filters: GridFilters;
  sort: SortRule[];
} {
  const query = normalizeFeedQuery(target.query);

  return {
    table: target.table,
    page: query.page,
    pageSize: query.pageSize,
    query: query.query,
    matchMode: query.matchMode,
    filters: query.filters,
    sort: query.sort
  };
}

export function createFeedDataRecordFromPayload(target: PlaygroundFeedDataTarget, requestKey: string, payload: GridListPayload): PlaygroundFeedDataRecord {
  return {
    targetId: target.id,
    requestKey,
    rows: payload.rows,
    totalRows: payload.totalRows,
    status: "ready",
    loadedAt: new Date().toISOString()
  };
}

export function formatPlaygroundFeedValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleString("pt-BR");
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function mergeFeedCellStyle(feedCell: PlaygroundCell, baseCell?: PlaygroundCell): PlaygroundCell {
  if (!baseCell?.style) return feedCell;

  return {
    ...feedCell,
    style: {
      ...feedCell.style,
      ...baseCell.style
    }
  };
}

export function getPlaygroundFeedCellAt(
  target: PlaygroundFeedDataTarget,
  rows: Array<Record<string, unknown>>,
  row: number,
  col: number,
  baseCell?: PlaygroundCell,
  relationDisplayLookup: Record<string, Record<string, unknown>> = {}
): PlaygroundCell | null {
  const columnOffset = col - target.position.col;
  if (columnOffset < 0 || columnOffset >= target.columns.length) return null;

  const rowOffset = row - target.position.row;
  if (rowOffset < 0) return null;

  const column = target.columns[columnOffset];
  if (rowOffset === 0) {
    return mergeFeedCellStyle({
      value: target.columnLabels[column] ?? column,
      style: {
        background: "#eaf1ff",
        color: "#1d4ed8",
        bold: true
      },
      feedId: target.id
    }, baseCell);
  }

  const sourceRow = rows[rowOffset - 1];
  if (!sourceRow) return null;
  const value = resolveDisplayValueFromLookup(sourceRow, column, relationDisplayLookup);

  return mergeFeedCellStyle({
    value: formatPlaygroundFeedValue(value),
    feedId: target.id
  }, baseCell);
}

export function buildPlaygroundFeedCellIndex(
  targets: PlaygroundFeedDataTarget[],
  rowsByTargetId: Record<string, Array<Record<string, unknown>>>,
  baseCells: Record<string, PlaygroundCell> = {},
  relationDisplayLookupByTargetId: Record<string, Record<string, Record<string, unknown>>> = {}
) {
  const cells: Record<string, PlaygroundCell> = {};

  for (const target of targets) {
    const rows = rowsByTargetId[target.id] ?? [];
    const rowCount = rows.length + 1;
    const relationDisplayLookup = relationDisplayLookupByTargetId[target.id] ?? {};

    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < target.columns.length; columnOffset += 1) {
        const row = target.position.row + rowOffset;
        const col = target.position.col + columnOffset;
        const key = `${row}:${col}`;
        const cell = getPlaygroundFeedCellAt(target, rows, row, col, baseCells[key], relationDisplayLookup);
        if (cell) {
          cells[key] = cell;
        }
      }
    }
  }

  return cells;
}

export function getFeedFragmentExclusionLiterals(feed: PlaygroundFeed, sourceColumn: string) {
  return getFragmentValueLiterals(feed.fragments, sourceColumn);
}
