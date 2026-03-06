import type { GridFilters, GridListPayload, LookupsPayload, Role, SheetKey, SortRule } from "@/components/ui-grid/types";

type ApiEnvelope<T> = {
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function buildActorHeaders(role: Role) {
  return {
    "Content-Type": "application/json",
    "x-user-role": role,
    "x-user-name": "grid-user",
    "x-user-email": "grid-user@rn-gestor.local"
  };
}

async function parseApi<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? "Falha na operacao da API");
  }

  return json.data;
}

export async function fetchSheetRows(params: {
  table: SheetKey;
  role: Role;
  page: number;
  pageSize: number;
  query: string;
  matchMode: "contains" | "exact" | "starts" | "ends";
  filters: GridFilters;
  sort: SortRule[];
}) {
  const queryString = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    query: params.query,
    matchMode: params.matchMode,
    filters: JSON.stringify(params.filters),
    sort: JSON.stringify(params.sort)
  });

  const response = await fetch(`/api/v1/grid/${params.table}?${queryString.toString()}`, {
    cache: "no-store",
    headers: buildActorHeaders(params.role)
  });

  return parseApi<GridListPayload>(response);
}

export async function upsertSheetRow(params: {
  table: SheetKey;
  role: Role;
  row: Record<string, unknown>;
}) {
  const response = await fetch(`/api/v1/grid/${params.table}`, {
    method: "POST",
    headers: buildActorHeaders(params.role),
    body: JSON.stringify({ row: params.row })
  });

  return parseApi<{ operation: "insert" | "update"; row: Record<string, unknown> }>(response);
}

export async function deleteSheetRow(params: {
  table: SheetKey;
  id: string;
  role: Role;
}) {
  const response = await fetch(`/api/v1/grid/${params.table}/${params.id}`, {
    method: "DELETE",
    headers: buildActorHeaders(params.role)
  });

  return parseApi<{ deleted: boolean; id: string }>(response);
}

export async function fetchLookups(role: Role) {
  const response = await fetch("/api/v1/lookups", {
    cache: "no-store",
    headers: buildActorHeaders(role)
  });

  return parseApi<LookupsPayload>(response);
}

export async function runFinalize(carroId: string, role: Role) {
  const response = await fetch(`/api/v1/finalizados/${carroId}`, {
    method: "POST",
    headers: buildActorHeaders(role)
  });

  return parseApi<{ finalizado: Record<string, unknown>; carro: Record<string, unknown> }>(response);
}

export async function runRebuild(role: Role) {
  const response = await fetch("/api/v1/repetidos/rebuild", {
    method: "POST",
    headers: buildActorHeaders(role)
  });

  return parseApi<{ grupos_repetidos: number; registros_repetidos: number }>(response);
}
