/**
 * lib/api/grid/bulk.ts
 *
 * Escritor avancado: upsert em lote a partir de linhas (CSV) ja coercidas no
 * cliente. Suporta dry-run (apply=false) que classifica cada linha em
 * insert/update/error sem gravar, e aplicacao real (apply=true).
 *
 * - Com matchColumn: casa cada linha por essa coluna (chave de correspondencia,
 *   ex.: placa). Existe -> UPDATE pelo PK encontrado; nao existe -> INSERT.
 * - Sem matchColumn: INSERT puro.
 *
 * Caminho generico (sem dispatch de dominio): grava direto na tabela. Triggers
 * de banco (repetidos/estado_anuncio) continuam disparando. Enriquecimento de
 * dominio (lookup de placa, contexto de preco) NAO se aplica no import em lote.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { ActorContext } from "@/lib/api/auth";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { getGridTableConfig, type GridTableConfig } from "@/lib/api/grid-config";
import { createGridBusinessError, createGridReadOnlyError, createGridTableNotFoundError } from "@/lib/api/grid/errors";
import { sanitizeForUpdate } from "@/lib/api/grid/policy";
import type { Database } from "@/lib/supabase/database.types";

type GridSupabase = SupabaseClient<Database>;

type BulkRowResult = {
  index: number;
  op: "insert" | "update" | "error" | "skip";
  error?: string;
};

type BulkOutcome = {
  table: string;
  matchColumn: string | null;
  applied: boolean;
  summary: { total: number; toInsert: number; toUpdate: number; errors: number };
  results: BulkRowResult[];
};

function resolveConfigOrThrow(table: string): GridTableConfig {
  const config = getGridTableConfig(table);
  if (!config) throw createGridTableNotFoundError(table);
  return config;
}

export async function bulkUpsertGridRows(input: {
  req: NextRequest;
  table: string;
  actor: ActorContext;
  supabase: GridSupabase;
}): Promise<BulkOutcome> {
  const { req, table, actor, supabase } = input;
  const config = resolveConfigOrThrow(table);

  if (config.readOnly) throw createGridReadOnlyError();
  requireRole(actor, config.minWriteRole);

  const body = (await req.json().catch(() => null)) as
    | { rows?: unknown; matchColumn?: unknown; apply?: unknown }
    | null;

  if (!body || !Array.isArray(body.rows)) {
    throw createGridBusinessError(400, "BULK_INVALID_BODY", "Payload esperado: { rows: [...], matchColumn, apply }.");
  }

  const apply = body.apply === true;
  const matchColumnRaw = typeof body.matchColumn === "string" ? body.matchColumn.trim() : "";
  const matchColumn = matchColumnRaw || null;

  if (matchColumn && !config.readableColumns.includes(matchColumn)) {
    throw createGridBusinessError(400, "BULK_INVALID_MATCH_COLUMN", "Chave de correspondencia invalida.", {
      matchColumn,
      readableColumns: config.readableColumns
    });
  }

  const rawRows = body.rows as Array<Record<string, unknown>>;
  const cleanRows = rawRows.map((row) => sanitizeForUpdate(row ?? {}, config.editableColumns));

  // Conjunto de valores-da-chave que JA existem (a chave pode ser nao-unica:
  // varios registros podem compartilhar o mesmo valor).
  const existingKeys = new Set<string>();
  if (matchColumn) {
    const values = Array.from(
      new Set(
        cleanRows
          .map((row) => row[matchColumn])
          .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
          .map((value) => String(value))
      )
    );

    // Consulta em lotes pra nao estourar o tamanho do IN.
    const BATCH = 500;
    for (let i = 0; i < values.length; i += BATCH) {
      const slice = values.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from(config.table)
        .select(matchColumn as "*")
        .in(matchColumn as never, slice as never);
      if (error) {
        throw createGridBusinessError(500, "BULK_LOOKUP_FAILED", "Falha ao consultar registros existentes.", error);
      }
      for (const found of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        existingKeys.add(String(found[matchColumn]));
      }
    }
  }

  const results: BulkRowResult[] = [];

  function classify(row: Record<string, unknown>, index: number): BulkRowResult {
    if (Object.keys(row).length === 0) {
      return { index, op: "error", error: "Linha sem colunas mapeaveis." };
    }
    if (matchColumn) {
      const value = row[matchColumn];
      if (value === undefined || value === null || String(value).trim() === "") {
        return { index, op: "error", error: `Valor da chave "${matchColumn}" ausente.` };
      }
      return existingKeys.has(String(value)) ? { index, op: "update" } : { index, op: "insert" };
    }
    return { index, op: "insert" };
  }

  // Dry-run: so classifica.
  if (!apply) {
    cleanRows.forEach((row, index) => results.push(classify(row, index)));
    return buildOutcome(config, matchColumn, false, results);
  }

  // Aplicacao real.
  for (let index = 0; index < cleanRows.length; index += 1) {
    const row = cleanRows[index];
    const plan = classify(row, index);
    if (plan.op === "error") {
      results.push(plan);
      continue;
    }

    try {
      if (plan.op === "update" && matchColumn) {
        // Atualiza TODAS as linhas que casam o valor da chave (chave nao-unica).
        const patch = { ...row };
        delete patch[matchColumn];
        delete patch[config.primaryKey];
        const { error } = await supabase
          .from(config.table)
          .update(patch as never)
          .eq(matchColumn as never, row[matchColumn] as never);
        if (error) throw error;
        results.push({ index, op: "update" });
      } else {
        const { error } = await supabase.from(config.table).insert(row as never);
        if (error) throw error;
        results.push({ index, op: "insert" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao gravar linha.";
      results.push({ index, op: "error", error: message });
    }
  }

  const summary = summarize(results);
  await writeAuditLog({
    action: "update",
    table: config.table,
    actor,
    emLote: true,
    details: `Import em lote: ${summary.toInsert} inserida(s), ${summary.toUpdate} atualizada(s), ${summary.errors} erro(s).`
  });

  return buildOutcome(config, matchColumn, true, results);
}

function summarize(results: BulkRowResult[]) {
  return {
    total: results.length,
    toInsert: results.filter((r) => r.op === "insert").length,
    toUpdate: results.filter((r) => r.op === "update").length,
    errors: results.filter((r) => r.op === "error").length
  };
}

function buildOutcome(
  config: GridTableConfig,
  matchColumn: string | null,
  applied: boolean,
  results: BulkRowResult[]
): BulkOutcome {
  return { table: config.table, matchColumn, applied, summary: summarize(results), results };
}
