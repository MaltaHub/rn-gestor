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
import { apiFetch, parseEnvelope } from "@/lib/api/http-client";
import { getDevActorAuthUserId } from "@/lib/domain/auth-session";

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
    "x-auth-user-id": getDevActorAuthUserId(role),
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
  mode?: "insert" | "update";
}) {
  const response = await fetchWithTimeout(`/api/v1/grid/${params.table}`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ row: params.row, priceChangeContext: params.priceChangeContext ?? null, mode: params.mode })
  });

  return parseApi<{ operation: "insert" | "update"; row: Record<string, unknown> }>(response);
}

export type BulkRowResult = { index: number; op: "insert" | "update" | "error" | "skip"; error?: string };
export type BulkUpsertResult = {
  table: string;
  matchColumn: string | null;
  applied: boolean;
  summary: { total: number; toInsert: number; toUpdate: number; errors: number };
  results: BulkRowResult[];
};

/** Escritor avancado: upsert em lote (dry-run quando apply=false). */
export async function bulkUpsertSheetRows(params: {
  table: SheetKey;
  requestAuth: RequestAuth;
  rows: Record<string, unknown>[];
  matchColumn: string | null;
  apply: boolean;
}) {
  const response = await fetchWithTimeout(
    `/api/v1/grid/${params.table}/bulk`,
    {
      method: "POST",
      headers: buildRequestHeaders(params.requestAuth),
      body: JSON.stringify({ rows: params.rows, matchColumn: params.matchColumn, apply: params.apply })
    },
    60_000
  );

  return parseApi<BulkUpsertResult>(response);
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
  data_venda?: string | null;
  data_entrega?: string | null;
  canal_cliente?: string | null;
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

// ---- Área /vendedor (vitrine de veículos) ----

export type VendedorCarroListItem = {
  id: string;
  placa: string;
  nome: string | null;
  estado_venda: string;
  em_estoque: boolean;
  tem_fotos: boolean;
  preco_original: number | null;
  ano_mod: number | null;
  cor: string | null;
  cover_url?: string | null;
  modelos?: { modelo?: string | null } | Array<{ modelo?: string | null }> | null;
};

export async function fetchVendedorCarros(params: {
  requestAuth: RequestAuth;
  q?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.pageSize ?? 24));
  query.set("available", "1");
  query.set("cover", "1");

  const response = await fetchWithTimeout(`/api/v1/carros?${query.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth),
    signal: params.signal
  });

  return parseApi<VendedorCarroListItem[]>(response);
}

export type VehiclePhotoItem = {
  id: string;
  fileName: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  sortOrder: number;
};

export type VendedorCarroDetail = Record<string, unknown> & {
  id: string;
  placa: string;
  nome: string | null;
  modelos?: { modelo?: string | null } | Array<{ modelo?: string | null }> | null;
};

export async function fetchCarroById(params: { requestAuth: RequestAuth; carroId: string }) {
  const response = await fetchWithTimeout(`/api/v1/carros/${params.carroId}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<VendedorCarroDetail>(response);
}

export async function setCarroFotoCapa(params: { requestAuth: RequestAuth; carroId: string; fileId: string | null }) {
  const response = await fetchWithTimeout(`/api/v1/carros/${params.carroId}/foto-capa`, {
    method: "PATCH",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ fileId: params.fileId })
  });

  return parseApi<{ id: string; foto_capa_id: string | null }>(response);
}

export async function fetchVehiclePhotos(params: { requestAuth: RequestAuth; carroId: string }) {
  const response = await fetchWithTimeout(`/api/v1/carros/${params.carroId}/fotos`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ cover: VehiclePhotoItem | null; photos: VehiclePhotoItem[] }>(response);
}

export type VehicleDocumentFile = {
  id: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  previewUrl: string | null;
  downloadUrl: string | null;
  isMissing: boolean;
};

export async function fetchVehicleDocuments(params: { requestAuth: RequestAuth; carroId: string }) {
  const response = await fetchWithTimeout(`/api/v1/carros/${params.carroId}/documentos`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ placa: string; files: VehicleDocumentFile[] }>(response);
}

export async function createVehicleShareLink(params: {
  requestAuth: RequestAuth;
  carroId: string;
  expiresInMinutes: number;
}) {
  const response = await fetchWithTimeout(`/api/v1/carros/${params.carroId}/compartilhar`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ expiresInMinutes: params.expiresInMinutes })
  });

  return parseApi<{ token: string; url: string; expiresAt: string }>(response);
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

// ===== Atalhos: controle de envelopes + post-its =====

export type EnvelopeItem = "envelope" | "chave_reserva";
export type ObservacaoTipo = "fixo" | "urgente" | "observacao";

export type EnvelopeAbertoRow = {
  id: string;
  carro_id: string;
  item: EnvelopeItem;
  status: string;
  usuario_auth_user_id: string | null;
  observacao: string | null;
  retirado_em: string;
  devolvido_em: string | null;
};

export type EnvelopeStatus = "com_usuario" | "devolvido";

export async function listEnvelopesAbertos(params: {
  carroId: string;
  requestAuth: RequestAuth;
  includeClosed?: boolean;
}) {
  const search = new URLSearchParams({ carro_id: params.carroId });
  if (params.includeClosed) search.set("include_closed", "1");
  const response = await fetchWithTimeout(`/api/v1/controle-envelopes?${search.toString()}`, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ abertos: EnvelopeAbertoRow[]; rows: EnvelopeAbertoRow[]; include_closed: boolean }>(response);
}

export async function registrarRetiradaEnvelope(params: {
  requestAuth: RequestAuth;
  carroId: string;
  item: EnvelopeItem;
  observacao?: string | null;
  /** ADM: registrar em nome de outro usuario. */
  usuarioAuthUserId?: string | null;
  /** ADM: data/hora retroativa em ISO 8601. */
  retiradoEm?: string | null;
}) {
  const body: Record<string, unknown> = {
    carro_id: params.carroId,
    item: params.item,
    observacao: params.observacao ?? null
  };
  if (params.usuarioAuthUserId !== undefined) body.usuario_auth_user_id = params.usuarioAuthUserId;
  if (params.retiradoEm) body.retirado_em = params.retiradoEm;
  const response = await fetchWithTimeout("/api/v1/controle-envelopes", {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(body)
  });

  return parseApi<{ row: EnvelopeAbertoRow }>(response);
}

export async function devolverEnvelope(params: {
  requestAuth: RequestAuth;
  id: string;
  /** ADM: atribuir devolucao a outro usuario. */
  usuarioAuthUserId?: string | null;
  /** ADM: data/hora retroativa em ISO 8601. */
  devolvidoEm?: string | null;
}) {
  const body: Record<string, unknown> = {};
  if (params.usuarioAuthUserId !== undefined) body.usuario_auth_user_id = params.usuarioAuthUserId;
  if (params.devolvidoEm) body.devolvido_em = params.devolvidoEm;
  const response = await fetchWithTimeout(`/api/v1/controle-envelopes/${params.id}/devolver`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(body)
  });

  return parseApi<{ row: EnvelopeAbertoRow }>(response);
}

export type AtualizarEnvelopeInput = {
  item?: EnvelopeItem;
  status?: EnvelopeStatus;
  usuario_auth_user_id?: string | null;
  observacao?: string | null;
  retirado_em?: string;
  devolvido_em?: string | null;
};

export async function atualizarEnvelope(params: {
  requestAuth: RequestAuth;
  id: string;
  patch: AtualizarEnvelopeInput;
}) {
  const response = await fetchWithTimeout(`/api/v1/controle-envelopes/${params.id}`, {
    method: "PATCH",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(params.patch)
  });

  return parseApi<{ row: EnvelopeAbertoRow }>(response);
}

export async function excluirEnvelope(params: { requestAuth: RequestAuth; id: string }) {
  const response = await fetchWithTimeout(`/api/v1/controle-envelopes/${params.id}`, {
    method: "DELETE",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ row: EnvelopeAbertoRow }>(response);
}

/** Ultimas interacoes de envelope (todos os veiculos) — visao "recentes" do atalho. */
export async function listEnvelopesRecentes(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/controle-envelopes/recentes", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<{ recentes: EnvelopeAbertoRow[] }>(response);
}

/** Conta retiradas em aberto (todos os veiculos) — alimenta o selo do botao de envelope. */
export async function fetchEnvelopesAbertosCount(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/controle-envelopes/abertos", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<{ count: number }>(response);
}

export type AccessUserOption = {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string | null;
  cargo: string;
  status: string;
};

/** ADM-only. Usado pelo picker "quem pegou". */
export async function listAccessUsers(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/admin/users", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<{ users: AccessUserOption[]; lookups: { roles: { code: string; name: string }[]; statuses: { code: string; name: string }[] } }>(response);
}

export type PostitRow = {
  id: string;
  carro_id: string | null;
  titulo: string | null;
  tipo: ObservacaoTipo;
  texto: string;
  status: string;
  prazo: string | null;
  autor_auth_user_id: string | null;
  resolvido_em: string | null;
  feedback_solucao: string | null;
  created_at: string;
};

/** Com carroId: post-its ativos do veiculo. Sem carroId: os 10 mais recentes (qualquer veiculo). */
export async function listPostitsAtivos(params: { carroId?: string | null; requestAuth: RequestAuth }) {
  const carroId = params.carroId?.trim();
  const url = carroId
    ? `/api/v1/observacoes?carro_id=${encodeURIComponent(carroId)}`
    : "/api/v1/observacoes";
  const response = await fetchWithTimeout(url, {
    cache: "no-store",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ ativas: PostitRow[] }>(response);
}

export async function criarPostit(params: {
  requestAuth: RequestAuth;
  carroId?: string | null;
  titulo?: string | null;
  tipo: ObservacaoTipo;
  texto: string;
  prazo?: string | null;
}) {
  const carroId = params.carroId?.trim() || null;
  const prazo = params.prazo?.trim() || null;
  const titulo = params.titulo?.trim() || null;
  const response = await fetchWithTimeout("/api/v1/observacoes", {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify({ carro_id: carroId, titulo, tipo: params.tipo, texto: params.texto, prazo })
  });

  return parseApi<{ row: { id: string } }>(response);
}

export async function resolverPostit(params: {
  requestAuth: RequestAuth;
  id: string;
  /** Solucao livre — registrada junto com a resolucao. */
  feedbackSolucao?: string | null;
}) {
  const body: Record<string, unknown> = {};
  if (params.feedbackSolucao !== undefined) body.feedback_solucao = params.feedbackSolucao;
  const response = await fetchWithTimeout(`/api/v1/observacoes/${params.id}/resolver`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(body)
  });

  return parseApi<{ row: PostitRow }>(response);
}

export type AtualizarPostitInput = {
  titulo?: string | null;
  tipo?: ObservacaoTipo;
  texto?: string;
  prazo?: string | null;
  feedback_solucao?: string | null;
};

export async function atualizarPostit(params: {
  requestAuth: RequestAuth;
  id: string;
  patch: AtualizarPostitInput;
}) {
  const response = await fetchWithTimeout(`/api/v1/observacoes/${params.id}`, {
    method: "PATCH",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(params.patch)
  });

  return parseApi<{ row: PostitRow }>(response);
}

export async function excluirPostit(params: { requestAuth: RequestAuth; id: string }) {
  const response = await fetchWithTimeout(`/api/v1/observacoes/${params.id}`, {
    method: "DELETE",
    headers: buildRequestHeaders(params.requestAuth)
  });

  return parseApi<{ row: PostitRow }>(response);
}

export async function fetchUrgentesCount(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/observacoes/urgentes", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<{ count: number }>(response);
}
