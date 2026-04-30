import { ApiClientError, buildRequestHeaders, fetchSheetRows } from "@/components/ui-grid/api";
import type { GridFilters, GridListPayload, RequestAuth, SheetKey, SortRule } from "@/components/ui-grid/types";
import type { ApiEnvelope } from "@/lib/core/types";

export type PlaygroundFacetOption = {
  literal: string;
  label: string;
  count: number;
};

export type PlaygroundFacetPayload = {
  table: SheetKey;
  column: string;
  options: PlaygroundFacetOption[];
};

export async function fetchPlaygroundFeedRows(params: {
  table: SheetKey;
  requestAuth: RequestAuth;
  page: number;
  pageSize: number;
  query: string;
  matchMode: "contains" | "exact" | "starts" | "ends";
  filters: GridFilters;
  sort: SortRule[];
  signal?: AbortSignal;
}): Promise<GridListPayload> {
  return fetchSheetRows(params);
}

async function parsePlaygroundApi<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let json: ApiEnvelope<T>;

  try {
    json = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError("Resposta invalida da API de alimentadores. O servidor retornou algo que nao e JSON.", {
      status: response.status,
      code: "PLAYGROUND_API_INVALID_JSON",
      details: raw.slice(0, 500)
    });
  }

  if (!response.ok || json.error) {
    throw new ApiClientError(json.error?.message ?? "Falha na operacao da API", {
      status: response.status,
      code: json.error?.code,
      details: json.error?.details
    });
  }

  return json.data;
}

export async function fetchPlaygroundColumnFacets(params: {
  table: SheetKey;
  column: string;
  requestAuth: RequestAuth;
  query: string;
  matchMode: "contains" | "exact" | "starts" | "ends";
  filters: GridFilters;
  signal?: AbortSignal;
}) {
  const queryString = new URLSearchParams({
    column: params.column,
    query: params.query,
    matchMode: params.matchMode,
    filters: JSON.stringify(params.filters),
    sort: JSON.stringify([])
  });

  const response = await fetch(`/api/v1/grid/${params.table}/facets?${queryString.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth),
    signal: params.signal
  });

  return parsePlaygroundApi<PlaygroundFacetPayload>(response);
}
