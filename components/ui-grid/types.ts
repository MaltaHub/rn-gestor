import type { AppRole } from "@/lib/domain/access";
import type { GridTableName } from "@/lib/domain/grid-policy";

export type SheetKey = GridTableName;

export type Role = AppRole;

export type CurrentActor = {
  authUserId: string | null;
  role: Role;
  status: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
};

export type RequestAuth = {
  accessToken: string | null;
  devRole?: Role | null;
};

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
