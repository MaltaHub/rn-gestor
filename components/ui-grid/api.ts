import type {
  CurrentActor,
  GridFilters,
  GridInsightsSummaryPayload,
  GridListPayload,
  LookupsPayload,
  RequestAuth,
  Role,
  SheetKey,
  SortRule
} from "@/components/ui-grid/types";
import { ApiClientError, apiFetch, parseEnvelope } from "@/lib/api/http-client";

export { ApiClientError } from "@/lib/api/http-client";

export type PlateLookupFipe = {
  codigo_fipe: string | null;
  codigo_marca: number | null;
  codigo_modelo: string | null;
  ano_modelo: number | null;
  combustivel: string | null;
  id_valor: number | null;
  mes_referencia: string | null;
  referencia_fipe: number | null;
  score: number | null;
  sigla_combustivel: string | null;
  texto_marca: string | null;
  texto_modelo: string | null;
  texto_valor: string | null;
  tipo_modelo: number | null;
  raw: unknown;
};

export type PlateLookupPayload = {
  placa: string;
  placa_alternativa?: string | null;
  uf: string | null;
  municipio?: string | null;
  marca: string | null;
  modelo: string | null;
  submodelo?: string | null;
  versao?: string | null;
  ano: string | number | null;
  ano_fabricacao?: number | null;
  ano_modelo?: number | null;
  cor: string | null;
  combustivel?: string | null;
  situacao: string | null;
  origem?: string | null;
  chassi?: string | null;
  logo?: string | null;
  extra: Record<string, unknown> | null;
  fipe: PlateLookupFipe | null;
  fipe_score?: number | null;
  fipes?: PlateLookupFipe[];
  raw: unknown;
};

export type CarroCaracteristicasPayload = {
  caracteristicas_visuais_ids: string[];
  caracteristicas_tecnicas_ids: string[];
};

export type AuditDashboardEntry = {
  id: string;
  actionCode: string;
  actionLabel: string;
  authorName: string;
  authorRole: string | null;
  authorEmail: string | null;
  beforeData: unknown;
  afterData: unknown;
  batchId: string | null;
  createdAt: string;
  details: string | null;
  inBatch: boolean;
  pk: string | null;
  table: string;
};

export type AuditDashboardPayload = {
  filters: {
    actions: Array<{ code: string; label: string }>;
    authors: string[];
    tables: string[];
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  rows: AuditDashboardEntry[];
};

const API_REQUEST_TIMEOUT_MS = 15_000;
const GRID_INSIGHTS_REQUEST_TIMEOUT_MS = 30_000;

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

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = API_REQUEST_TIMEOUT_MS
) {
  return apiFetch(input, init, { timeoutMs });
}

function parseApi<T>(response: Response): Promise<T> {
  return parseEnvelope<T>(response, { fallbackErrorMessage: "Falha na operacao da API" });
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
  signal?: AbortSignal;
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
    headers: buildRequestHeaders(params.requestAuth),
    signal: params.signal
  });

  return parseApi<GridListPayload>(response);
}

export async function fetchGridInsightsSummary(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/insights/summary", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  }, GRID_INSIGHTS_REQUEST_TIMEOUT_MS);

  return parseApi<GridInsightsSummaryPayload>(response);
}

export async function fetchMissingAnuncioRows(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/insights/anuncios/missing-rows", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  }, GRID_INSIGHTS_REQUEST_TIMEOUT_MS);

  return parseApi<{ rows: Array<Record<string, unknown>> }>(response);
}

export async function runVerifyAnuncioInsight(params: { ids: string[]; requestAuth: RequestAuth }) {
  await Promise.all(
    params.ids.map((id) =>
      fetchWithTimeout(`/api/v1/anuncios/${id}/verify-insight`, {
        method: "POST",
        headers: buildRequestHeaders(params.requestAuth),
        body: JSON.stringify({ code: "ATUALIZAR_ANUNCIO" })
      }).then((res) => parseApi<{ verified: boolean }>(res))
    )
  );
}

export async function verifyAnuncioInsight(params: { id: string; code?: string; requestAuth: RequestAuth }) {
  const response = await fetchWithTimeout(`/api/v1/anuncios/${params.id}/verify-insight`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ code: params.code ?? "ATUALIZAR_ANUNCIO" })
  });

  return parseApi<{ verified: boolean; id: string; code: string }>(response);
}

// --- Price change contexts -------------------------------------------------

export type PriceChangeContextEntry = {
  id: string;
  table_name: string;
  row_id: string;
  column_name: string;
  old_value: number | null;
  new_value: number | null;
  context: string;
  created_by: string | null;
  created_at: string;
};

export async function fetchLatestPriceChangeContext(params: {
  table: string;
  rowId: string;
  column: string;
  requestAuth: RequestAuth;
}) {
  const qs = new URLSearchParams({ table: params.table, row_id: params.rowId, column: params.column });
  const res = await fetchWithTimeout(`/api/v1/price-contexts/latest?${qs.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });
  return parseApi<{ entry: PriceChangeContextEntry | null }>(res);
}

export async function fetchPriceChangeContexts(params: {
  table?: string;
  rowId?: string;
  column?: string;
  page: number;
  pageSize: number;
  requestAuth: RequestAuth;
}) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
  if (params.table) qs.set("table", params.table);
  if (params.rowId) qs.set("row_id", params.rowId);
  if (params.column) qs.set("column", params.column);

  const res = await fetchWithTimeout(`/api/v1/price-contexts?${qs.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });
  return parseApi<{ rows: PriceChangeContextEntry[] }>(res);
}

export async function fetchAuditDashboard(params: {
  requestAuth: RequestAuth;
  page: number;
  pageSize: number;
  sortBy?: "createdAt" | "table" | "action" | "author";
  sortDir?: "asc" | "desc";
  autor?: string;
  tabela?: string;
  acao?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  searchMode?: "search" | "contains" | "exact" | "starts" | "ends";
}) {
  const queryString = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize)
  });

  if (params.autor) queryString.set("autor", params.autor);
  if (params.tabela) queryString.set("tabela", params.tabela);
  if (params.acao) queryString.set("acao", params.acao);
  if (params.dateFrom) queryString.set("date_from", params.dateFrom);
  if (params.dateTo) queryString.set("date_to", params.dateTo);
  if (params.search) queryString.set("search", params.search);
  if (params.searchMode) queryString.set("search_mode", params.searchMode);
  if (params.sortBy) queryString.set("sort_by", params.sortBy);
  if (params.sortDir) queryString.set("sort_dir", params.sortDir);

  const response = await fetchWithTimeout(`/api/v1/auditoria/dashboard?${queryString.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<AuditDashboardPayload>(response);
}

export async function upsertSheetRow(params: {
  table: SheetKey;
  requestAuth: RequestAuth;
  row: Record<string, unknown>;
  priceChangeContext?: string | null;
}) {
  const response = await fetchWithTimeout(`/api/v1/grid/${params.table}`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ row: params.row, priceChangeContext: params.priceChangeContext ?? null })
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

export type CreateVendaQuickPayload = {
  carro_id: string;
  vendedor_auth_user_id: string;
  forma_pagamento: "a_vista" | "financiado" | "consorcio" | "parcelado" | "misto";
  valor_total?: number | null;
  valor_entrada?: number | null;
  comprador_nome?: string | null;
  comprador_documento?: string | null;
  observacao?: string | null;
};

export async function createVenda(params: {
  requestAuth: RequestAuth;
  payload: CreateVendaQuickPayload;
}) {
  const response = await fetchWithTimeout("/api/v1/vendas", {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(params.payload)
  });

  return parseApi<Record<string, unknown>>(response);
}

export type VendaConcluidaRow = {
  id: string;
  carro_id: string;
  estado_venda: string;
  data_venda: string | null;
  valor_total: number | null;
  comprador_nome: string | null;
  forma_pagamento: string | null;
  vendedor_auth_user_id: string | null;
};

export async function listVendasByCarro(params: {
  requestAuth: RequestAuth;
  carroId: string;
  estadoVenda?: "concluida" | "cancelada" | "obsoleta";
}) {
  const query = new URLSearchParams();
  query.set("carro_id", params.carroId);
  query.set("page_size", "20");
  if (params.estadoVenda) query.set("estado_venda", params.estadoVenda);

  const response = await fetchWithTimeout(`/api/v1/vendas?${query.toString()}`, {
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<VendaConcluidaRow[]>(response);
}

export async function updateVendaEstado(params: {
  requestAuth: RequestAuth;
  id: string;
  estadoVenda: "concluida" | "cancelada" | "obsoleta";
}) {
  const response = await fetchWithTimeout(`/api/v1/vendas/${params.id}`, {
    method: "PATCH",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ estado_venda: params.estadoVenda })
  });

  return parseApi<Record<string, unknown>>(response);
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

export async function lookupCarByPlate(placa: string, requestAuth: RequestAuth) {
  const queryString = new URLSearchParams({
    placa
  });

  const response = await fetchWithTimeout(`/api/v1/carros/consulta-placa?${queryString.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<PlateLookupPayload>(response);
}

export async function fetchCarroCaracteristicas(carroId: string, requestAuth: RequestAuth) {
  const response = await fetchWithTimeout(`/api/v1/carros/${carroId}/caracteristicas`, {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<CarroCaracteristicasPayload>(response);
}

export async function syncCarroCaracteristicas(params: {
  carroId: string;
  caracteristicasVisuaisIds: string[];
  caracteristicasTecnicasIds: string[];
  requestAuth: RequestAuth;
}) {
  const response = await fetchWithTimeout(`/api/v1/carros/${params.carroId}/caracteristicas`, {
    method: "PUT",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({
      caracteristicas_visuais_ids: params.caracteristicasVisuaisIds,
      caracteristicas_tecnicas_ids: params.caracteristicasTecnicasIds
    })
  });

  return parseApi<CarroCaracteristicasPayload>(response);
}
