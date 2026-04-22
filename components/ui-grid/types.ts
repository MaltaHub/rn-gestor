export type { CurrentActor, RequestAuth, Role } from "@/lib/domain/auth-session";
export type { LookupItem, LookupsPayload } from "@/lib/core/types";
import type { Role } from "@/lib/domain/auth-session";
import type { GridTableName } from "@/lib/domain/grid-policy";

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
