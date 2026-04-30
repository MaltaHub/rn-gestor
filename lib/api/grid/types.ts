import type { GridFilters, GridSortRule, GridTableConfig } from "@/lib/api/grid-config";

export type GridRowPayload = Record<string, unknown>;
export type GridMatchMode = "contains" | "exact" | "starts" | "ends";

export type GridWriteBody = {
  row: GridRowPayload;
  priceChangeContext?: string;
};

export type GridRequestContract = {
  page: number;
  pageSize: number;
  queryText: string;
  matchMode: GridMatchMode;
  sort: GridSortRule[];
  filters: GridFilters;
  body: GridWriteBody | null;
};

export type GridContractInput = {
  method: string;
  searchParams: URLSearchParams;
  body?: unknown;
};

export type GridContextBase = {
  config: GridTableConfig;
};

export type GridFacetOption = {
  literal: string;
  label: string;
  count: number;
};

export type GridFacetPayload = {
  table: string;
  column: string;
  options: GridFacetOption[];
};
