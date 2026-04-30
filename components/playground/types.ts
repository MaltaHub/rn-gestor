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

export type PlaygroundFeedFragment = {
  id: string;
  parentFeedId: string;
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
  fragments: PlaygroundFeedFragment[];
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
  printMargin: "compact";
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
};
