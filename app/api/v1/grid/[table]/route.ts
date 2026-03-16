import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { getGridTableConfig, parseGridFilters, parseGridSort } from "@/lib/api/grid-config";
import { writeAuditLog } from "@/lib/api/audit";
import {
  isGridRelationTable,
  parseGridRelationRowId,
  withGridRelationRowId
} from "@/lib/api/grid-relation-row-id";
import { enrichCarroInsertPayload } from "@/lib/domain/carros-enrichment";
import type { Json } from "@/lib/supabase/database.types";

type RowPayload = Record<string, unknown>;

type MatchMode = "contains" | "exact" | "starts" | "ends";

function parsePrimitive(value: string): string | number | boolean {
  const normalized = value.trim();
  if (normalized.toLowerCase() === "true") return true;
  if (normalized.toLowerCase() === "false") return false;
  if (normalized !== "" && !Number.isNaN(Number(normalized))) return Number(normalized);
  return normalized;
}

function sanitizeForUpdate(row: RowPayload, lockedColumns: string[]) {
  const locked = new Set(lockedColumns);
  const out: RowPayload = {};

  for (const [key, value] of Object.entries(row)) {
    if (locked.has(key)) continue;
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

function resolveGridHeader(config: ReturnType<typeof getGridTableConfig>, rows: RowPayload[]) {
  if (!config || rows.length === 0) {
    return config?.defaultHeader ?? [];
  }

  const discovered = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !column.startsWith("__"));
  const discoveredSet = new Set(discovered);

  return [
    ...config.defaultHeader.filter((column) => discoveredSet.has(column)),
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

    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? req.nextUrl.searchParams.get("page_size") ?? 50))
    );
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const queryText = (req.nextUrl.searchParams.get("query") ?? "").trim();
    const matchMode = (req.nextUrl.searchParams.get("matchMode") ?? "contains") as MatchMode;
    const sort = parseGridSort(req.nextUrl.searchParams.get("sort"));
    const filters = parseGridFilters(req.nextUrl.searchParams.get("filters"));

    let query = supabase.from(config.table).select("*", { count: "exact" });

    if (queryText && config.searchableColumns.length > 0) {
      const pattern = patternByMode(queryText, matchMode);
      const orFilter = config.searchableColumns.map((col) => `${col}.ilike.${pattern}`).join(",");
      query = query.or(orFilter);
    }

    for (const [column, expressionRaw] of Object.entries(filters)) {
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

    const sortChain = sort.length > 0 ? sort : config.defaultSort;
    for (const rule of sortChain) {
      query = query.order(rule.column, { ascending: rule.dir === "asc" });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new ApiHttpError(500, "GRID_LIST_FAILED", "Falha ao listar dados da planilha.", error);
    }

    const rows = ((data ?? []) as RowPayload[]).map((row) => withGridRelationRowId(config.table, row));
    const header = resolveGridHeader(config, rows);

    return apiOk(
      {
        table: config.table,
        label: config.label,
        header,
        rows,
        totalRows: count ?? 0,
        page,
        pageSize,
        sort: sortChain,
        filters
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

    const body = (await req.json()) as { row?: RowPayload };
    if (!body.row || typeof body.row !== "object") {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload esperado: { row: {...} }.");
    }

    const pkValue = body.row[config.primaryKey];

    if (isGridRelationTable(config.table) && typeof pkValue === "string" && pkValue.trim()) {
      const relationRowId = parseGridRelationRowId(pkValue);
      if (!relationRowId) {
        throw new ApiHttpError(400, "INVALID_RELATION_ROW_ID", "Identificador composto invalido.");
      }

      const updatePayload = sanitizeForUpdate(body.row, config.lockedColumns);
      delete updatePayload.__row_id;

      const { data: oldData, error: oldError } = await supabase
        .from(config.table)
        .select("*")
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

      const { data, error } = await supabase
        .from(config.table)
        .update(updatePayload as never)
        .eq("carro_id", relationRowId.carroId)
        .eq("caracteristica_id", relationRowId.caracteristicaId)
        .select("*")
        .single();

      if (error) {
        throw new ApiHttpError(400, "GRID_UPDATE_FAILED", "Falha ao atualizar registro da planilha.", error);
      }

      const nextRow = withGridRelationRowId(config.table, data as RowPayload);
      const nextRowAudit = JSON.parse(JSON.stringify(nextRow)) as Json;

      await writeAuditLog({
        action: "update",
        table: config.table,
        pk: pkValue,
        actor,
        oldData,
        newData: nextRowAudit
      });

      return apiOk({ operation: "update", row: nextRow }, { request_id: requestId });
    }

    if (typeof pkValue === "string" && pkValue.trim()) {
      const updatePayload = sanitizeForUpdate(body.row, config.lockedColumns);

      const { data: oldData, error: oldError } = await supabase
        .from(config.table)
        .select("*")
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
        .select("*")
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

    let insertPayload = sanitizeForUpdate(body.row, []);
    delete insertPayload.__row_id;

    if (config.table === "carros") {
      const { payload: enrichedPayload } = await enrichCarroInsertPayload({
        supabase,
        row: insertPayload
      });

      insertPayload = enrichedPayload;
    }

    const { data, error } = await supabase
      .from(config.table)
      .insert(insertPayload as never)
      .select("*")
      .single();

    if (error) {
      throw new ApiHttpError(400, "GRID_INSERT_FAILED", "Falha ao inserir registro da planilha.", error);
    }

    const row = withGridRelationRowId(config.table, data as RowPayload);
    const rowAudit = JSON.parse(JSON.stringify(row)) as Json;
    const newPk = String(row[config.primaryKey] ?? data[config.primaryKey as keyof typeof data] ?? "");
    await writeAuditLog({
      action: "create",
      table: config.table,
      pk: newPk || null,
      actor,
      newData: rowAudit
    });

    return apiOk({ operation: "insert", row }, { request_id: requestId });
  });
}
