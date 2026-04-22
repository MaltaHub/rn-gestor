export type { CurrentActor, RequestAuth, Role } from "@/lib/domain/auth-session";
export type { LookupItem, LookupsPayload } from "@/lib/core/types";
import type { Role } from "@/lib/domain/auth-session";
import type { GridTableName } from "@/lib/domain/grid-policy";
import type { PrintHighlightRule } from "@/components/ui-grid/print-highlights";

export type SheetKey = GridTableName;

export type SortRule = {
  column: string;
  dir: "asc" | "desc";
};

export type GridFilters = Record<string, string>;

export type GridListPayload = {
  table: SheetKey;
  label: string;
  header: string[];
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  page: number;
  pageSize: number;
  sort: SortRule[];
  filters: GridFilters;
};

export type TableInsightSummary = {
  pendingActionCount: number;
  missingDataCount: number;
  hasPendingAction: boolean;
};

export type GridInsightsSummaryPayload = {
  byTable: Partial<Record<SheetKey, TableInsightSummary>>;
};

export type SheetConfig = {
  key: SheetKey;
  label: string;
  group: string;
  description?: string;
  primaryKey: string;
  minReadRole: Role;
  minWriteRole: Role;
  minDeleteRole: Role;
  readOnly?: boolean;
  lockedColumns: string[];
  rowClassName?: (row: Record<string, unknown>) => string;
};

export type PrintScope = "table" | "filtered" | "selected";
export type PrintSortDirection = "asc" | "desc";

export type PrintableSectionOption = {
  literal: string;
  label: string;
  count: number;
};

export type RelationDialogTarget = "grid" | "print";
export type CarFormSectionKey = "technical" | "characteristics";

export type StoredPrintConfig = {
  title: string;
  scope: PrintScope;
  columns: string[];
  columnLabels: Record<string, string>;
  filters: Record<string, string[]>;
  displayColumnOverrides: Record<string, string>;
  sortColumn: string;
  sortDirection: PrintSortDirection;
  sectionColumn: string;
  sectionValues: string[];
  includeOthers: boolean;
  highlightOpacityPercent: number;
  highlightRules: PrintHighlightRule[];
};

export type StoredSheetLayout = {
  hiddenColumns: string[];
  pinnedColumn: string | null;
};

export type StoredSheetPagination = {
  page: number;
  pageSize: number;
};

export type StoredSelectionModes = {
  conference: boolean;
  editor: boolean;
};

export type StoredWorkspacePanels = {
  grid: boolean;
  form: boolean;
};

export type StoredGridScroll = {
  left: number;
  top: number;
};

export type MobileBodyScrollLockSnapshot = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  scrollLeft: number;
  scrollTop: number;
};

export type ResizeState = {
  column: string;
  startX: number;
  startWidth: number;
};

export type SplitResizeState = {
  startX: number;
  startRatio: number;
};

export type SecondaryGridState = {
  sheet: SheetConfig;
  payload: GridListPayload | null;
  loading: boolean;
  error: string | null;
};
