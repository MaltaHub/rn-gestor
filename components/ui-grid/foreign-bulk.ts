import { bulkUpsertSheetRows, type BulkUpsertResult } from "@/components/ui-grid/api";
import { isForeignColumnKey, planForeignWrites, type ForeignColumn, type PrimaryKeyOf } from "@/components/ui-grid/core/foreign-columns";
import type { RelationRowsProvider } from "@/components/ui-grid/core/relation-path";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type BulkRowResult = BulkUpsertResult["results"][number];

function normalizeKey(value: unknown) {
  return value == null ? "" : String(value).trim().toUpperCase();
}

/**
 * Escrita avançada com COLUNAS ESTRANGEIRAS. As linhas do CSV casam com as
 * linhas JÁ CARREGADAS do grid pela chave escolhida (que pode ser estrangeira,
 * ex.: carro_id>placa); cada valor vai para a tabela onde mora:
 *   - colunas da própria tabela -> bulk da tabela, casando pelo PK;
 *   - colunas estrangeiras      -> bulk da tabela de destino, casando pela chave da FK.
 * O servidor revalida tabela, coluna e papel em cada bulk (nada novo é aceito).
 * Só ATUALIZA: linha sem correspondência vira erro, nunca INSERT.
 */
export async function bulkWriteWithForeignColumns(params: {
  table: SheetKey;
  primaryKey: string;
  requestAuth: RequestAuth;
  rows: Array<Record<string, unknown>>;
  matchColumn: string | null;
  apply: boolean;
  loadedRows: Array<Record<string, unknown>>;
  columns: ForeignColumn[];
  getRows: RelationRowsProvider;
  primaryKeyOf: PrimaryKeyOf;
}): Promise<BulkUpsertResult> {
  const { matchColumn } = params;
  if (!matchColumn) {
    throw new Error("Para gravar colunas estrangeiras, escolha a chave de correspondência (ex.: placa).");
  }

  const byKey = new Map<string, Array<Record<string, unknown>>>();
  for (const row of params.loadedRows) {
    const key = normalizeKey(row[matchColumn]);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  const errors: BulkRowResult[] = [];
  const local = new Map<string, Record<string, unknown>>();
  const localSources = new Map<string, number>();
  const entries: Array<{ index: number; row: Record<string, unknown>; values: Record<string, unknown> }> = [];

  params.rows.forEach((csvRow, index) => {
    const matches = byKey.get(normalizeKey(csvRow[matchColumn])) ?? [];
    if (matches.length === 0) {
      errors.push({ index, op: "error", error: `Nenhuma linha com ${matchColumn} = ${String(csvRow[matchColumn] ?? "")}.` });
      return;
    }
    const foreignValues: Record<string, unknown> = {};
    const localValues: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(csvRow)) {
      if (column === matchColumn || column === params.primaryKey) continue;
      (isForeignColumnKey(column) ? foreignValues : localValues)[column] = value;
    }
    for (const row of matches) {
      const pk = String(row[params.primaryKey] ?? "");
      if (pk && Object.keys(localValues).length > 0) {
        local.set(pk, { ...(local.get(pk) ?? { [params.primaryKey]: pk }), ...localValues });
        if (!localSources.has(pk)) localSources.set(pk, index);
      }
      if (Object.keys(foreignValues).length > 0) entries.push({ index, row, values: foreignValues });
    }
  });

  const plan = planForeignWrites({ entries, columns: params.columns, getRows: params.getRows, primaryKeyOf: params.primaryKeyOf });
  for (const problem of plan.errors) errors.push({ index: problem.index, op: "error", error: problem.error });

  const calls: Array<{ table: SheetKey; keyColumn: string; rows: Array<Record<string, unknown>>; sources: number[] }> = [];
  if (local.size > 0) {
    calls.push({
      table: params.table,
      keyColumn: params.primaryKey,
      rows: Array.from(local.values()),
      sources: Array.from(local.keys()).map((pk) => localSources.get(pk) ?? 0)
    });
  }
  for (const [table, bucket] of plan.byTable) {
    calls.push({
      table,
      keyColumn: bucket.keyColumn,
      rows: Array.from(bucket.rows.values()),
      sources: Array.from(bucket.rows.keys()).map((id) => bucket.sources.get(id) ?? 0)
    });
  }

  let toUpdate = 0;
  for (const call of calls) {
    const result = await bulkUpsertSheetRows({
      table: call.table,
      requestAuth: params.requestAuth,
      rows: call.rows,
      matchColumn: call.keyColumn,
      apply: params.apply
    });
    toUpdate += result.summary.toUpdate;
    for (const entry of result.results) {
      if (entry.op === "error") {
        errors.push({ index: call.sources[entry.index] ?? 0, op: "error", error: `${call.table}: ${entry.error ?? "falha"}` });
      }
    }
  }

  errors.sort((left, right) => left.index - right.index);
  return {
    table: params.table,
    matchColumn,
    applied: params.apply,
    summary: { total: params.rows.length, toInsert: 0, toUpdate, errors: errors.length },
    results: errors
  };
}
