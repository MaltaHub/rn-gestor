import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError, createGridContractError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { getGridTableConfig, type GridFilters, type GridSortRule } from "@/lib/api/grid-config";
import { apiOk } from "@/lib/api/response";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import {
  isGridRelationTable,
  parseGridRelationRowId,
  withGridRelationRowId
} from "@/lib/api/grid-relation-row-id";
import { enrichGridRowsWithInsights } from "@/lib/api/grid-insights";
import { createCarro, updateCarro } from "@/lib/domain/carros/service";
import { createAnuncio, updateAnuncio } from "@/lib/domain/anuncios/service";
import { createModelo, updateModelo } from "@/lib/domain/modelos/service";

type RowPayload = Record<string, unknown>;
type MatchMode = "contains" | "exact" | "starts" | "ends";

const MATCH_MODES: MatchMode[] = ["contains", "exact", "starts", "ends"];

function parsePrimitive(value: string): string | number | boolean {
  const normalized = value.trim();
  if (normalized.toLowerCase() === "true") return true;
  if (normalized.toLowerCase() === "false") return false;
  if (normalized !== "" && !Number.isNaN(Number(normalized))) return Number(normalized);
  return normalized;
}

function sanitizeForUpdate(row: RowPayload, editableColumns: string[]) {
  const editable = new Set(editableColumns);
  const out: RowPayload = {};

  for (const [key, value] of Object.entries(row)) {
    if (!editable.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }

  return out;
}

function patternByMode(raw: string, mode: MatchMode) {
  if (mode === "exact") return raw;
  if (mode === "starts") return `${raw}%`;
  if (mode === "ends") return `%${raw}`;
  return `%${raw}%`;
}

function parseJsonOrThrow(raw: string, code: "GRID_CONTRACT_INVALID_QUERY" | "GRID_CONTRACT_INVALID_BODY", details: unknown) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw createGridContractError(code, "JSON invalido no contrato da requisicao.", details);
  }
}

async function parseGridRequestContract(req: NextRequest, config: NonNullable<ReturnType<typeof getGridTableConfig>>) {
  const pageRaw = Number(req.nextUrl.searchParams.get("page") ?? 1);
  const pageSizeRaw = Number(req.nextUrl.searchParams.get("pageSize") ?? req.nextUrl.searchParams.get("page_size") ?? 50);
  if (!Number.isFinite(pageRaw) || !Number.isFinite(pageSizeRaw)) {
    throw createGridContractError("GRID_CONTRACT_INVALID_QUERY", "Paginacao invalida.");
  }

  const page = Math.max(1, pageRaw);
  const pageSize = Math.min(200, Math.max(1, pageSizeRaw));
  const queryText = (req.nextUrl.searchParams.get("query") ?? "").trim();

  const rawMatchMode = (req.nextUrl.searchParams.get("matchMode") ?? "contains").trim();
  if (!MATCH_MODES.includes(rawMatchMode as MatchMode)) {
    throw createGridContractError("GRID_CONTRACT_INVALID_MATCH_MODE", "Modo de busca invalido.", {
      matchMode: rawMatchMode,
      allowed: MATCH_MODES
    });
  }
  const matchMode = rawMatchMode as MatchMode;

  const sortable = new Set(config.sortableColumns);
  const filterable = new Set(config.filterableColumns);

  const sortRaw = req.nextUrl.searchParams.get("sort");
  const sort: GridSortRule[] = [];
  if (sortRaw) {
    const parsed = parseJsonOrThrow(sortRaw, "GRID_CONTRACT_INVALID_QUERY", { field: "sort" });
    if (!Array.isArray(parsed)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_SORT", "Ordenacao invalida.", { sort: parsed });
    }

    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        throw createGridContractError("GRID_CONTRACT_INVALID_SORT", "Ordenacao invalida.", { item });
      }
      const column = (item as { column?: unknown }).column;
      const dir = (item as { dir?: unknown }).dir;
      if (typeof column !== "string" || (dir !== "asc" && dir !== "desc") || !sortable.has(column)) {
        throw createGridContractError("GRID_CONTRACT_INVALID_SORT", "Ordenacao nao permitida para coluna.", {
          item,
          sortableColumns: config.sortableColumns
        });
      }
      sort.push({ column, dir });
    }
  }

  const filtersRaw = req.nextUrl.searchParams.get("filters");
  const filters: GridFilters = {};
  if (filtersRaw) {
    const parsed = parseJsonOrThrow(filtersRaw, "GRID_CONTRACT_INVALID_QUERY", { field: "filters" });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_FILTER", "Filtro invalido.", { filters: parsed });
    }

    for (const [column, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!filterable.has(column)) {
        throw createGridContractError("GRID_CONTRACT_INVALID_FILTER", "Filtro nao permitido para coluna.", {
          column,
          filterableColumns: config.filterableColumns
        });
      }
      if (typeof value !== "string") {
        throw createGridContractError("GRID_CONTRACT_INVALID_FILTER", "Filtro deve ser texto.", { column, value });
      }
      filters[column] = value.trim();
    }
  }

  let body: { row: RowPayload; priceChangeContext?: string } | null = null;
  if (req.method === "POST") {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Body JSON invalido.");
    }

    if (!rawBody || typeof rawBody !== "object" || !("row" in rawBody)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Payload esperado: { row: {...} }.");
    }

    const row = (rawBody as { row?: unknown }).row;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Payload esperado: { row: {...} }.");
    }

    const allowedWriteColumns = new Set([config.primaryKey, "__row_id", ...config.editableColumns]);
    for (const column of Object.keys(row as Record<string, unknown>)) {
      if (!allowedWriteColumns.has(column)) {
        throw createGridContractError("GRID_CONTRACT_INVALID_EDIT_COLUMN", "Coluna nao permitida para escrita.", {
          column,
          editableColumns: config.editableColumns
        });
      }
    }

    body = {
      row: row as RowPayload,
      priceChangeContext:
        typeof (rawBody as { priceChangeContext?: unknown }).priceChangeContext === "string"
          ? (rawBody as { priceChangeContext?: string }).priceChangeContext
          : undefined
    };
  }

  return { page, pageSize, queryText, matchMode, sort, filters, body };
}

function resolveGridHeader(config: ReturnType<typeof getGridTableConfig>, rows: RowPayload[]) {
  if (!config || rows.length === 0) {
    return (config?.defaultHeader ?? []).filter((column) => !config?.excludedColumns?.includes(column));
  }

  const excludedColumns = new Set(config.excludedColumns ?? []);
  const discovered = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter(
    (column) => !column.startsWith("__") && !excludedColumns.has(column)
  );
  const discoveredSet = new Set(discovered);

  return [
    ...config.defaultHeader.filter((column) => discoveredSet.has(column) && !excludedColumns.has(column)),
    ...discovered.filter((column) => !config.defaultHeader.includes(column))
  ];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { table } = await params;
    const config = getGridTableConfig(table);

    if (!config) {
      throw new ApiHttpError(404, "GRID_TABLE_NOT_FOUND", "Tabela de grid nao suportada.", { table });
    }

    requireRole(actor, config.minReadRole);

    const contract = await parseGridRequestContract(req, config);
    const from = (contract.page - 1) * contract.pageSize;
    const to = from + contract.pageSize - 1;
    const selectColumns = Array.from(new Set(config.readableColumns.filter((column) => !column.startsWith("__")))).join(",");

    let query = supabase.from(config.table).select(selectColumns, { count: "exact" });

    if (contract.queryText && config.searchableColumns.length > 0) {
      const pattern = patternByMode(contract.queryText, contract.matchMode);
      const orFilter = config.searchableColumns.map((col) => `${col}.ilike.${pattern}`).join(",");
      query = query.or(orFilter);
    }

    for (const [column, expressionRaw] of Object.entries(contract.filters)) {
      const expression = expressionRaw.trim();
      if (!expression) continue;

      if (expression.toUpperCase() === "VAZIO") {
        query = query.is(column, null);
        continue;
      }

      if (expression.toUpperCase() === "!VAZIO") {
        query = query.not(column, "is", null);
        continue;
      }

      if (expression.toUpperCase().startsWith("EXCETO ")) {
        const value = parsePrimitive(expression.slice(7));
        query = query.neq(column, value);
        continue;
      }

      if (expression.startsWith(">=")) {
        query = query.gte(column, parsePrimitive(expression.slice(2)));
        continue;
      }

      if (expression.startsWith("<=")) {
        query = query.lte(column, parsePrimitive(expression.slice(2)));
        continue;
      }

      if (expression.startsWith(">")) {
        query = query.gt(column, parsePrimitive(expression.slice(1)));
        continue;
      }

      if (expression.startsWith("<")) {
        query = query.lt(column, parsePrimitive(expression.slice(1)));
        continue;
      }

      if (expression.startsWith("!=")) {
        query = query.neq(column, parsePrimitive(expression.slice(2)));
        continue;
      }

      if (expression.startsWith("=")) {
        query = query.eq(column, parsePrimitive(expression.slice(1)));
        continue;
      }

      if (expression.includes("|")) {
        const values = expression
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean)
          .map(parsePrimitive);

        query = query.in(column, values);
        continue;
      }

      query = query.ilike(column, `%${expression}%`);
    }

    const sortChain = contract.sort.length > 0 ? contract.sort : config.defaultSort;
    for (const rule of sortChain) {
      query = query.order(rule.column, { ascending: rule.dir === "asc" });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new ApiHttpError(500, "GRID_LIST_FAILED", "Falha ao listar dados da planilha.", error);
    }

    const enrichedRows = await enrichGridRowsWithInsights({
      supabase,
      table: config.table,
      rows: (data ?? []) as unknown as RowPayload[]
    });
    const rows = enrichedRows.map((row) => withGridRelationRowId(config.table, row));
    const header = resolveGridHeader(config, rows);

    return apiOk(
      {
        table: config.table,
        label: config.label,
        header,
        rows,
        totalRows: count ?? 0,
        page: contract.page,
        pageSize: contract.pageSize,
        sort: sortChain,
        filters: contract.filters
      },
      { request_id: requestId }
    );
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { table } = await params;
    const config = getGridTableConfig(table);

    if (!config) {
      throw new ApiHttpError(404, "GRID_TABLE_NOT_FOUND", "Tabela de grid nao suportada.", { table });
    }

    if (config.readOnly) {
      throw new ApiHttpError(405, "GRID_TABLE_READ_ONLY", "Esta planilha e somente leitura.");
    }

    requireRole(actor, config.minWriteRole);

    const contract = await parseGridRequestContract(req, config);
    if (!contract.body) {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Payload esperado: { row: {...} }.");
    }

    const pkValue = contract.body.row[config.primaryKey];

    if (isGridRelationTable(config.table) && typeof pkValue === "string" && pkValue.trim()) {
      const relationRowId = parseGridRelationRowId(pkValue);
      if (!relationRowId) {
        throw new ApiHttpError(400, "INVALID_RELATION_ROW_ID", "Identificador composto invalido.");
      }

      const updatePayload = sanitizeForUpdate(contract.body.row, config.editableColumns);
      delete updatePayload.__row_id;

      const { data: oldData, error: oldError } = await supabase
        .from(config.table)
        .select(config.readableColumns.join(","))
        .eq("carro_id", relationRowId.carroId)
        .eq("caracteristica_id", relationRowId.caracteristicaId)
        .maybeSingle();

      if (oldError) {
        throw new ApiHttpError(400, "GRID_ROW_READ_FAILED", "Falha ao carregar registro para edicao.", oldError);
      }
      if (!oldData) {
        throw new ApiHttpError(404, "NOT_FOUND", "Registro nao encontrado para edicao.", {
          table: config.table,
          pk: pkValue
        });
      }

      const tableName1 = String(config.table);
      if (tableName1 === "anuncios" && Object.prototype.hasOwnProperty.call(updatePayload, "valor_anuncio")) {
        const context = String(contract.body.priceChangeContext ?? "").trim();
        const oldValue = Number((oldData as unknown as Record<string, unknown>)?.["valor_anuncio"] ?? null);
        const newValue = Number((updatePayload as Record<string, unknown>)?.["valor_anuncio"] ?? null);
        if (oldValue !== newValue) {
          if (!context) {
            throw new ApiHttpError(400, "PRICE_CHANGE_CONTEXT_REQUIRED", "Explique a alteracao de preco para salvar.");
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("price_change_contexts").insert({
            table_name: "anuncios",
            row_id: String((oldData as unknown as Record<string, unknown>)?.["id"] ?? ""),
            column_name: "valor_anuncio",
            old_value: Number.isFinite(oldValue) ? oldValue : null,
            new_value: Number.isFinite(newValue) ? newValue : null,
            context,
            created_by: actor.userId
          } as never);
        }
      }

      const { data, error } = await supabase
        .from(config.table)
        .update(updatePayload as never)
        .eq("carro_id", relationRowId.carroId)
        .eq("caracteristica_id", relationRowId.caracteristicaId)
        .select(config.readableColumns.join(","))
        .single();

      if (error) {
        throw new ApiHttpError(400, "GRID_UPDATE_FAILED", "Falha ao atualizar registro da planilha.", error);
      }

      const nextRow = withGridRelationRowId(config.table, data as unknown as RowPayload);

      await writeAuditLog({
        action: "update",
        table: config.table,
        pk: pkValue,
        actor,
        oldData,
        newData: toAuditJson(nextRow)
      });

      return apiOk({ operation: "update", row: nextRow }, { request_id: requestId });
    }

    if (typeof pkValue === "string" && pkValue.trim()) {
      const updatePayload = sanitizeForUpdate(contract.body.row, config.editableColumns);

      if (config.table === "carros") {
        const row = await updateCarro({
          supabase,
          actor,
          id: pkValue,
          patch: updatePayload,
          priceChangeContext: contract.body.priceChangeContext
        });
        return apiOk({ operation: "update", row }, { request_id: requestId });
      }
      if (config.table === "anuncios") {
        const row = await updateAnuncio({
          supabase,
          actor,
          id: pkValue,
          patch: updatePayload,
          priceChangeContext: contract.body.priceChangeContext
        });
        return apiOk({ operation: "update", row }, { request_id: requestId });
      }
      if (config.table === "modelos") {
        const row = await updateModelo({
          supabase,
          actor,
          id: pkValue,
          row: updatePayload
        });
        return apiOk({ operation: "update", row }, { request_id: requestId });
      }

      const { data: oldData, error: oldError } = await supabase
        .from(config.table)
        .select(config.readableColumns.join(","))
        .eq(config.primaryKey as never, pkValue as never)
        .maybeSingle();

      if (oldError) {
        throw new ApiHttpError(400, "GRID_ROW_READ_FAILED", "Falha ao carregar registro para edicao.", oldError);
      }
      if (!oldData) {
        throw new ApiHttpError(404, "NOT_FOUND", "Registro nao encontrado para edicao.", {
          table: config.table,
          pk: pkValue
        });
      }

      const { data, error } = await supabase
        .from(config.table)
        .update(updatePayload as never)
        .eq(config.primaryKey as never, pkValue as never)
        .select(config.readableColumns.join(","))
        .single();

      if (error) {
        throw new ApiHttpError(400, "GRID_UPDATE_FAILED", "Falha ao atualizar registro da planilha.", error);
      }

      await writeAuditLog({
        action: "update",
        table: config.table,
        pk: pkValue,
        actor,
        oldData,
        newData: data
      });

      return apiOk({ operation: "update", row: data }, { request_id: requestId });
    }

    const insertPayload = sanitizeForUpdate(contract.body.row, config.editableColumns);
    delete insertPayload.__row_id;

    if (config.table === "carros") {
      const row = await createCarro({
        supabase,
        actor,
        row: insertPayload
      });
      return apiOk({ operation: "insert", row }, { request_id: requestId });
    }
    if (config.table === "anuncios") {
      const row = await createAnuncio({
        supabase,
        actor,
        row: insertPayload
      });
      return apiOk({ operation: "insert", row }, { request_id: requestId });
    }
    if (config.table === "modelos") {
      const row = await createModelo({
        supabase,
        actor,
        row: insertPayload
      });
      return apiOk({ operation: "insert", row }, { request_id: requestId });
    }

    const { data, error } = await supabase
      .from(config.table)
      .insert(insertPayload as never)
      .select(config.readableColumns.join(","))
      .single();

    if (error) {
      throw new ApiHttpError(400, "GRID_INSERT_FAILED", "Falha ao inserir registro da planilha.", error);
    }

    const row = withGridRelationRowId(config.table, data as unknown as RowPayload);
    const newPk = String(row[config.primaryKey] ?? data[config.primaryKey as keyof typeof data] ?? "");
    await writeAuditLog({
      action: "create",
      table: config.table,
      pk: newPk || null,
      actor,
      newData: toAuditJson(row)
    });

    return apiOk({ operation: "insert", row }, { request_id: requestId });
  });
}
