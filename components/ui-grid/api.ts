import type {
  CurrentActor,
  GridFilters,
  GridListPayload,
  LookupsPayload,
  RequestAuth,
  Role,
  SheetKey,
  SortRule
} from "@/components/ui-grid/types";

type ApiEnvelope<T> = {
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

const API_REQUEST_TIMEOUT_MS = 15_000;

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options?.status ?? 500;
    this.code = options?.code;
    this.details = options?.details;
  }
}

function buildDevHeaders(role: Role) {
  return {
    "x-user-role": role,
    "x-user-name": `dev-${role.toLowerCase()}`,
    "x-user-email": `${role.toLowerCase()}@rn-gestor.local`
  };
}

export function buildAuthHeaders(auth: RequestAuth) {
  if (auth.accessToken) {
    return {
      Authorization: `Bearer ${auth.accessToken}`
    };
  }

  if (auth.devRole) {
    return buildDevHeaders(auth.devRole);
  }

  throw new Error("Contexto de autenticacao ausente para chamada da API.");
}

export function buildRequestHeaders(auth: RequestAuth) {
  return {
    "Content-Type": "application/json",
    ...buildAuthHeaders(auth)
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("Tempo limite excedido ao comunicar com a API.", {
        status: 408,
        code: "REQUEST_TIMEOUT"
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseApi<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || json.error) {
    throw new ApiClientError(json.error?.message ?? "Falha na operacao da API", {
      status: response.status,
      code: json.error?.code,
      details: json.error?.details
    });
  }

  return json.data;
}

export async function fetchSheetRows(params: {
  table: SheetKey;
  requestAuth: RequestAuth;
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

  const response = await fetchWithTimeout(`/api/v1/grid/${params.table}?${queryString.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<GridListPayload>(response);
}

export async function upsertSheetRow(params: {
  table: SheetKey;
  requestAuth: RequestAuth;
  row: Record<string, unknown>;
}) {
  const response = await fetchWithTimeout(`/api/v1/grid/${params.table}`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ row: params.row })
  });

  return parseApi<{ operation: "insert" | "update"; row: Record<string, unknown> }>(response);
}

export async function deleteSheetRow(params: {
  table: SheetKey;
  id: string;
  requestAuth: RequestAuth;
}) {
  const response = await fetchWithTimeout(`/api/v1/grid/${params.table}/${params.id}`, {
    method: "DELETE",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ deleted: boolean; id: string }>(response);
}

export async function fetchLookups(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/lookups", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<LookupsPayload>(response);
}

export async function runFinalize(carroId: string, requestAuth: RequestAuth) {
  const response = await fetchWithTimeout(`/api/v1/finalizados/${carroId}`, {
    method: "POST",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<{ finalizado: Record<string, unknown>; carro: Record<string, unknown> }>(response);
}

export async function runRebuild(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/repetidos/rebuild", {
    method: "POST",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<{ grupos_repetidos: number; registros_repetidos: number }>(response);
}

export async function fetchCurrentActor(accessToken: string) {
  const response = await fetchWithTimeout("/api/v1/me", {
    cache: "no-store",
    headers: buildRequestHeaders({ accessToken })
  });

  return parseApi<CurrentActor>(response);
}
