import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext } from "@/lib/api/auth";
import { requireRole } from "@/lib/api/auth";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import type { GridTableConfig } from "@/lib/api/grid-config";
import { enrichGridRowsWithInsights } from "@/lib/api/grid-insights";
import { isGridRelationTable, parseGridRelationRowId, withGridRelationRowId } from "@/lib/api/grid-relation-row-id";
import { parseGridRequestContract } from "@/lib/api/grid/contract";
import { createGridBusinessError, createGridReadOnlyError, createGridTableNotFoundError } from "@/lib/api/grid/errors";
import { resolveGridHeader } from "@/lib/api/grid/header";
import { dispatchGridDomainCreate, dispatchGridDomainUpdate, isDomainMutationTable } from "@/lib/api/grid/mutation-dispatcher";
import { sanitizeForUpdate } from "@/lib/api/grid/policy";
import type { GridFacetOption, GridFacetPayload, GridRowPayload } from "@/lib/api/grid/types";
import { getGridTableConfig } from "@/lib/api/grid-config";
import type { Database } from "@/lib/supabase/database.types";
import type { NextRequest } from "next/server";

type GridSupabase = SupabaseClient<Database>;

type GridQueryChain = {
  is: (column: string, value: unknown) => GridQueryChain;
  not: (column: string, operator: string, value: unknown) => GridQueryChain;
  neq: (column: string, value: unknown) => GridQueryChain;
  gte: (column: string, value: unknown) => GridQueryChain;
  lte: (column: string, value: unknown) => GridQueryChain;
  gt: (column: string, value: unknown) => GridQueryChain;
  lt: (column: string, value: unknown) => GridQueryChain;
  eq: (column: string, value: unknown) => GridQueryChain;
  in: (column: string, value: unknown[]) => GridQueryChain;
  ilike: (column: string, value: string) => GridQueryChain;
  or: (filters: string) => GridQueryChain;
};

const GRID_FACET_BATCH_SIZE = 1000;
const EMPTY_FACET_LITERAL = "VAZIO";

function parsePrimitive(value: string): string | number | boolean {
  const normalized = value.trim();
  if (normalized.toLowerCase() === "true") return true;
  if (normalized.toLowerCase() === "false") return false;
  if (normalized !== "" && !Number.isNaN(Number(normalized))) return Number(normalized);
  return normalized;
}

function patternByMode(raw: string, mode: "contains" | "exact" | "starts" | "ends") {
  if (mode === "exact") return raw;
  if (mode === "starts") return `${raw}%`;
  if (mode === "ends") return `%${raw}`;
  return `%${raw}%`;
}

function resolveGridConfigOrThrow(table: string): GridTableConfig {
  const config = getGridTableConfig(table);
  if (!config) {
    throw createGridTableNotFoundError(table);
  }

  return config;
}

function resolveSelectableColumns(config: GridTableConfig) {
  const virtualColumns = new Set(config.virtualColumns);
  return Array.from(
    new Set(config.readableColumns.filter((column) => !column.startsWith("__") && !virtualColumns.has(column)))
  ).join(",");
}

function parseFilterList(value: string) {
  return value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function applyExcludedValueFilter(query: GridQueryChain, column: string, expression: string) {
  let next = query;
  const values = parseFilterList(expression);

  if (values.length === 0) {
    return next;
  }

  for (const value of values) {
    if (value.toUpperCase() === EMPTY_FACET_LITERAL) {
      next = next.not(column, "is", null);
      continue;
    }

    next = next.neq(column, parsePrimitive(value));
  }

  return next;
}

export function applyGridFilters<T extends GridQueryChain>(query: T, filters: Record<string, string>): T {
  let next: GridQueryChain = query;
  for (const [column, expressionRaw] of Object.entries(filters)) {
    const expression = expressionRaw.trim();
    if (!expression) continue;

    if (expression.toUpperCase() === "VAZIO") {
      next = next.is(column, null);
      continue;
    }

    if (expression.toUpperCase() === "!VAZIO") {
      next = next.not(column, "is", null);
      continue;
    }

    if (expression.toUpperCase().startsWith("EXCETO ")) {
      next = applyExcludedValueFilter(next, column, expression.slice(7));
      continue;
    }

    if (expression.startsWith(">=")) {
      next = next.gte(column, parsePrimitive(expression.slice(2)));
      continue;
    }

    if (expression.startsWith("<=")) {
      next = next.lte(column, parsePrimitive(expression.slice(2)));
      continue;
    }

    if (expression.startsWith(">")) {
      next = next.gt(column, parsePrimitive(expression.slice(1)));
      continue;
    }

    if (expression.startsWith("<")) {
      next = next.lt(column, parsePrimitive(expression.slice(1)));
      continue;
    }

    if (expression.startsWith("!=")) {
      next = next.neq(column, parsePrimitive(expression.slice(2)));
      continue;
    }

    if (expression.startsWith("=")) {
      next = next.eq(column, parsePrimitive(expression.slice(1)));
      continue;
    }

    if (expression.includes("|")) {
      const values = parseFilterList(expression).map(parsePrimitive);

      next = next.in(column, values);
      continue;
    }

    next = next.ilike(column, `%${expression}%`);
  }

  return next as T;
}

function applyGridSearch<T extends GridQueryChain>(query: T, config: GridTableConfig, queryText: string, matchMode: "contains" | "exact" | "starts" | "ends") {
  if (!queryText || config.searchableColumns.length === 0) return query;

  const pattern = patternByMode(queryText, matchMode);
  const orFilter = config.searchableColumns.map((col) => `${col}.ilike.${pattern}`).join(",");
  return query.or(orFilter) as T;
}

function toFacetLiteral(value: unknown) {
  if (value == null || value === "") return EMPTY_FACET_LITERAL;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toFacetLabel(value: unknown, column: string) {
  if (value == null || value === "") return "(vazio)";
  if (typeof value === "boolean") return value ? "Sim" : "Nao";

  if (typeof value === "number") {
    if (column.includes("preco") || column.includes("valor")) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    }

    return new Intl.NumberFormat("pt-BR").format(value);
  }

  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp) && value.includes("T")) {
      return new Date(timestamp).toLocaleString("pt-BR");
    }

    return value;
  }

  return JSON.stringify(value);
}

export function buildGridFacetOptions(rows: Array<Record<string, unknown>>, column: string): GridFacetOption[] {
  const bucket = new Map<string, { label: string; count: number; sortValue: string }>();

  for (const row of rows) {
    const rawValue = row[column];
    const literal = toFacetLiteral(rawValue);
    const label = toFacetLabel(rawValue, column);
    const current = bucket.get(literal);

    if (current) {
      current.count += 1;
      continue;
    }

    bucket.set(literal, {
      label,
      count: 1,
      sortValue: literal === EMPTY_FACET_LITERAL ? "" : label.toLocaleLowerCase("pt-BR")
    });
  }

  return Array.from(bucket.entries())
    .map(([literal, meta]) => ({
      literal,
      label: meta.label,
      count: meta.count,
      sortValue: meta.sortValue
    }))
    .sort((left, right) => {
      if (left.literal === EMPTY_FACET_LITERAL) return -1;
      if (right.literal === EMPTY_FACET_LITERAL) return 1;
      return left.sortValue.localeCompare(right.sortValue, "pt-BR", { numeric: true, sensitivity: "base" });
    })
    .map(({ literal, label, count }) => ({ literal, label, count }));
}

export async function listGridRows(input: {
  req: NextRequest;
  table: string;
  actor: ActorContext;
  supabase: GridSupabase;
}) {
  const { req, table, actor, supabase } = input;
  const config = resolveGridConfigOrThrow(table);
  requireRole(actor, config.minReadRole);

  const contract = await parseGridRequestContract(req, config);
  const from = (contract.page - 1) * contract.pageSize;
  const to = from + contract.pageSize - 1;
  const selectColumns = resolveSelectableColumns(config);

  let query = supabase.from(config.table).select(selectColumns, { count: "exact" });

  query = applyGridSearch(query as unknown as GridQueryChain, config, contract.queryText, contract.matchMode) as typeof query;

  query = applyGridFilters(query as unknown as GridQueryChain, contract.filters) as typeof query;

  const sortChain = contract.sort.length > 0 ? contract.sort : config.defaultSort;
  for (const rule of sortChain) {
    query = query.order(rule.column, { ascending: rule.dir === "asc" });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw createGridBusinessError(500, "GRID_LIST_FAILED", "Falha ao listar dados da planilha.", error);
  }

  const enrichedRows = await enrichGridRowsWithInsights({
    supabase,
    table: config.table,
    rows: (data ?? []) as unknown as GridRowPayload[]
  });
  const rows = enrichedRows.map((row) => withGridRelationRowId(config.table, row));
  const header = resolveGridHeader(config, rows);

  return {
    table: config.table,
    label: config.label,
    header,
    formColumns: config.formColumns,
    rows,
    totalRows: count ?? 0,
    page: contract.page,
    pageSize: contract.pageSize,
    sort: sortChain,
    filters: contract.filters
  };
}

export async function listGridFacets(input: {
  req: NextRequest;
  table: string;
  actor: ActorContext;
  supabase: GridSupabase;
}): Promise<GridFacetPayload> {
  const { req, table, actor, supabase } = input;
  const config = resolveGridConfigOrThrow(table);
  requireRole(actor, config.minReadRole);

  const column = (req.nextUrl.searchParams.get("column") ?? "").trim();
  if (!column || !config.filterableColumns.includes(column)) {
    throw createGridBusinessError(400, "GRID_FACET_INVALID_COLUMN", "Coluna nao permitida para facets.", {
      column,
      filterableColumns: config.filterableColumns
    });
  }

  const contract = await parseGridRequestContract(req, config);
  const filters = { ...contract.filters };
  delete filters[column];

  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  let totalRows: number | null = null;

  while (totalRows == null || rows.length < totalRows) {
    let query = supabase.from(config.table).select(column, { count: "exact" });
    query = applyGridSearch(query as unknown as GridQueryChain, config, contract.queryText, contract.matchMode) as typeof query;
    query = applyGridFilters(query as unknown as GridQueryChain, filters) as typeof query;

    const { data, error, count } = await query.range(offset, offset + GRID_FACET_BATCH_SIZE - 1);
    if (error) {
      throw createGridBusinessError(500, "GRID_FACET_LIST_FAILED", "Falha ao listar opcoes de filtro.", error);
    }

    const pageRows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    rows.push(...pageRows);
    totalRows = count ?? rows.length;

    if (pageRows.length < GRID_FACET_BATCH_SIZE) {
      break;
    }

    offset += GRID_FACET_BATCH_SIZE;
  }

  return {
    table: config.table,
    column,
    options: buildGridFacetOptions(rows, column)
  };
}

export async function mutateGridRow(input: {
  req: NextRequest;
  table: string;
  actor: ActorContext;
  supabase: GridSupabase;
}) {
  const { req, table, actor, supabase } = input;
  const config = resolveGridConfigOrThrow(table);

  if (config.readOnly) {
    throw createGridReadOnlyError();
  }

  requireRole(actor, config.minWriteRole);

  const contract = await parseGridRequestContract(req, config);
  if (!contract.body) {
    throw createGridBusinessError(400, "GRID_CONTRACT_INVALID_BODY", "Payload esperado: { row: {...} }.");
  }

  const pkValue = contract.body.row[config.primaryKey];

  if (isGridRelationTable(config.table) && typeof pkValue === "string" && pkValue.trim()) {
    const relationRowId = parseGridRelationRowId(pkValue);
    if (!relationRowId) {
      throw createGridBusinessError(400, "INVALID_RELATION_ROW_ID", "Identificador composto invalido.");
    }

    const updatePayload = sanitizeForUpdate(contract.body.row, config.editableColumns);
    delete updatePayload.__row_id;
    delete updatePayload[config.primaryKey];

    const { data: oldData, error: oldError } = await supabase
      .from(config.table)
      .select(resolveSelectableColumns(config))
      .eq("carro_id", relationRowId.carroId)
      .eq("caracteristica_id", relationRowId.caracteristicaId)
      .maybeSingle();

    if (oldError) {
      throw createGridBusinessError(400, "GRID_ROW_READ_FAILED", "Falha ao carregar registro para edicao.", oldError);
    }
    if (!oldData) {
      throw createGridBusinessError(404, "NOT_FOUND", "Registro nao encontrado para edicao.", { table: config.table, pk: pkValue });
    }

    const { data, error } = await supabase
      .from(config.table)
      .update(updatePayload as never)
      .eq("carro_id", relationRowId.carroId)
      .eq("caracteristica_id", relationRowId.caracteristicaId)
      .select(resolveSelectableColumns(config))
      .single();

    if (error) {
      throw createGridBusinessError(400, "GRID_UPDATE_FAILED", "Falha ao atualizar registro da planilha.", error);
    }

    const nextRow = withGridRelationRowId(config.table, data as unknown as GridRowPayload);

    await writeAuditLog({
      action: "update",
      table: config.table,
      pk: pkValue,
      actor,
      oldData,
      newData: toAuditJson(nextRow)
    });

    return { operation: "update" as const, row: nextRow };
  }

  if (typeof pkValue === "string" && pkValue.trim()) {
    const updatePayload = sanitizeForUpdate(contract.body.row, config.editableColumns);
    delete updatePayload[config.primaryKey];

    if (isDomainMutationTable(config.table)) {
      const row = await dispatchGridDomainUpdate({
        table: config.table,
        supabase,
        actor,
        id: pkValue,
        patch: updatePayload,
        priceChangeContext: contract.body.priceChangeContext
      });
      return { operation: "update" as const, row };
    }

    const { data: oldData, error: oldError } = await supabase
      .from(config.table)
      .select(resolveSelectableColumns(config))
      .eq(config.primaryKey as never, pkValue as never)
      .maybeSingle();

    if (oldError) {
      throw createGridBusinessError(400, "GRID_ROW_READ_FAILED", "Falha ao carregar registro para edicao.", oldError);
    }
    if (!oldData) {
      throw createGridBusinessError(404, "NOT_FOUND", "Registro nao encontrado para edicao.", { table: config.table, pk: pkValue });
    }

    const { data, error } = await supabase
      .from(config.table)
      .update(updatePayload as never)
      .eq(config.primaryKey as never, pkValue as never)
      .select(resolveSelectableColumns(config))
      .single();

    if (error) {
      throw createGridBusinessError(400, "GRID_UPDATE_FAILED", "Falha ao atualizar registro da planilha.", error);
    }

    await writeAuditLog({
      action: "update",
      table: config.table,
      pk: pkValue,
      actor,
      oldData,
      newData: data
    });

    return { operation: "update" as const, row: data };
  }

  const insertPayload = sanitizeForUpdate(contract.body.row, config.editableColumns);
  delete insertPayload.__row_id;

  if (isDomainMutationTable(config.table)) {
    const row = await dispatchGridDomainCreate({ table: config.table, supabase, actor, row: insertPayload });
    return { operation: "insert" as const, row };
  }

  const { data, error } = await supabase.from(config.table).insert(insertPayload as never).select(resolveSelectableColumns(config)).single();

  if (error) {
    throw createGridBusinessError(400, "GRID_INSERT_FAILED", "Falha ao inserir registro da planilha.", error);
  }

  const row = withGridRelationRowId(config.table, data as unknown as GridRowPayload);
  const newPk = String(row[config.primaryKey] ?? data[config.primaryKey as keyof typeof data] ?? "");
  await writeAuditLog({
    action: "create",
    table: config.table,
    pk: newPk || null,
    actor,
    newData: toAuditJson(row)
  });

  return { operation: "insert" as const, row };
}
