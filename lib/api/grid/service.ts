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
import type { GridRowPayload } from "@/lib/api/grid/types";
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
};

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

function applyFilters(query: GridQueryChain, filters: Record<string, string>) {
  let next = query;
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
      const value = parsePrimitive(expression.slice(7));
      next = next.neq(column, value);
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
      const values = expression
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(parsePrimitive);

      next = next.in(column, values);
      continue;
    }

    next = next.ilike(column, `%${expression}%`);
  }

  return next;
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
  const selectColumns = Array.from(new Set(config.readableColumns.filter((column) => !column.startsWith("__")))).join(",");

  let query = supabase.from(config.table).select(selectColumns, { count: "exact" });

  if (contract.queryText && config.searchableColumns.length > 0) {
    const pattern = patternByMode(contract.queryText, contract.matchMode);
    const orFilter = config.searchableColumns.map((col) => `${col}.ilike.${pattern}`).join(",");
    query = query.or(orFilter);
  }

  query = applyFilters(query, contract.filters);

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
    rows,
    totalRows: count ?? 0,
    page: contract.page,
    pageSize: contract.pageSize,
    sort: sortChain,
    filters: contract.filters
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

    const { data: oldData, error: oldError } = await supabase
      .from(config.table)
      .select(config.readableColumns.join(","))
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
      .select(config.readableColumns.join(","))
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
      .select(config.readableColumns.join(","))
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
      .select(config.readableColumns.join(","))
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

  const { data, error } = await supabase.from(config.table).insert(insertPayload as never).select(config.readableColumns.join(",")).single();

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
