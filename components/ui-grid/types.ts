export type SheetKey = "carros" | "anuncios" | "modelos" | "grupos_repetidos" | "repetidos";

export type Role = "VENDEDOR" | "SECRETARIO" | "GERENTE" | "ADMINISTRADOR";

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

export type LookupItem = {
  code: string;
  name: string;
};

export type LookupsPayload = {
  user_roles: LookupItem[];
  user_statuses: LookupItem[];
  sale_statuses: LookupItem[];
  announcement_statuses: LookupItem[];
  locations: LookupItem[];
  vehicle_states: LookupItem[];
};

export type SheetConfig = {
  key: SheetKey;
  label: string;
  primaryKey: string;
  readOnly?: boolean;
  lockedColumns: string[];
  rowClassName?: (row: Record<string, unknown>) => string;
};
