import type { SheetKey } from "@/components/ui-grid/types";
import { getRelationFor, type RelationRef } from "@/components/ui-grid/core/relations";
import {
  buildRelationPathLookup,
  formatRelationPath,
  parseRelationPath,
  resolveRelationPath,
  RELATION_PATH_SEPARATOR,
  type RelationRowsProvider,
  type ResolvedRelationPath
} from "@/components/ui-grid/core/relation-path";

/**
 * COLUNAS ESTRANGEIRAS: uma coluna de OUTRA tabela trazida para o grid seguindo
 * as FKs (o mesmo motor de caminho da expansão — core/relation-path).
 *
 * A chave da coluna é o caminho COMPLETO a partir de uma FK do sheet:
 *   documentos: "carro_id>chassi"              -> carros.chassi
 *               "carro_id>modelo_id>modelo"    -> modelos.modelo
 *
 * No cliente a coluna é MATERIALIZADA: cada linha ganha `row["carro_id>chassi"]`
 * com o valor resolvido. Assim busca, filtros, ordenação, impressão e o leitor
 * avançado tratam a coluna como qualquer outra. Escrever nela grava na tabela
 * DE DESTINO (a linha alcançada pelo caminho) — o servidor revalida tabela,
 * coluna e papel como em qualquer escrita do grid.
 */

export type ForeignColumn = {
  /** Chave completa (ex.: "carro_id>chassi"). */
  key: string;
  /** FK do sheet de onde o caminho sai. */
  baseColumn: string;
  baseRelation: RelationRef;
  /** Caminho depois da FK base (ex.: "chassi" ou "modelo_id>modelo"). */
  path: string;
  resolved: ResolvedRelationPath;
};

/**
 * Colunas que NÃO se editam por coluna estrangeira: têm fluxo próprio no cliente
 * (estado_venda abre a venda/conflito de venda no grid de carros).
 */
const FOREIGN_READ_ONLY: Partial<Record<SheetKey, string[]>> = {
  carros: ["estado_venda"]
};

export function isForeignColumnReadOnly(column: ForeignColumn): boolean {
  return (FOREIGN_READ_ONLY[column.resolved.displayTable] ?? []).includes(column.resolved.displayColumn);
}

export function isForeignColumnKey(column: string): boolean {
  return typeof column === "string" && column.includes(RELATION_PATH_SEPARATOR);
}

/** Interpreta a chave contra o mapa de FKs do sheet. Null = caminho inválido. */
export function parseForeignColumn(sheetKey: SheetKey, key: string): ForeignColumn | null {
  if (!isForeignColumnKey(key)) return null;
  const [baseColumn, ...rest] = parseRelationPath(key);
  if (!baseColumn || rest.length === 0) return null;
  const baseRelation = getRelationFor(sheetKey, baseColumn);
  if (!baseRelation) return null;
  const path = formatRelationPath(rest);
  const resolved = resolveRelationPath(baseRelation, path);
  if (!resolved) return null;
  return { key: formatRelationPath([baseColumn, ...rest]), baseColumn, baseRelation, path, resolved };
}

export function buildForeignColumnKey(baseColumn: string, path: string): string {
  return formatRelationPath([baseColumn, ...parseRelationPath(path)]);
}

/** Rótulo do cabeçalho: "carro_id › chassi". */
export function foreignColumnLabel(key: string): string {
  return parseRelationPath(key).join(" › ");
}

/** Rótulo curto do cabeçalho: tabela.coluna de destino (ex.: "carros.chassi"). */
export function foreignColumnShortLabel(column: ForeignColumn): string {
  return `${column.resolved.displayTable}.${column.resolved.displayColumn}`;
}

/** Só as chaves válidas para o sheet, sem repetição e sem colidir com colunas reais. */
export function validForeignColumns(sheetKey: SheetKey, keys: string[] | undefined, realColumns: string[]): ForeignColumn[] {
  const real = new Set(realColumns);
  const seen = new Set<string>();
  const result: ForeignColumn[] = [];
  for (const key of keys ?? []) {
    const parsed = parseForeignColumn(sheetKey, key);
    if (!parsed || real.has(parsed.key) || seen.has(parsed.key)) continue;
    seen.add(parsed.key);
    result.push(parsed);
  }
  return result;
}

/** Overrides sintéticos ({base: caminho}) — para pré-carregar as tabelas do caminho. */
export function foreignColumnsAsOverrides(columns: ForeignColumn[]): Array<Record<string, string>> {
  return columns.map((column) => ({ [column.baseColumn]: column.path }));
}

/**
 * Mapas `coluna -> (valor da FK base -> valor estrangeiro)`. Coluna cujo caminho
 * ainda não está todo em cache fica de fora (as linhas mostram vazio até carregar).
 */
export function buildForeignLookups(columns: ForeignColumn[], getRows: RelationRowsProvider) {
  const lookups: Record<string, Record<string, unknown>> = {};
  for (const column of columns) {
    const lookup = buildRelationPathLookup({ baseRelation: column.baseRelation, path: column.path, getRows });
    if (lookup) lookups[column.key] = lookup;
  }
  return lookups;
}

/** Linhas com as colunas estrangeiras preenchidas (mesmas linhas quando não há nenhuma). */
export function materializeForeignColumns(
  rows: Array<Record<string, unknown>>,
  columns: ForeignColumn[],
  lookups: Record<string, Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (columns.length === 0) return rows;
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const column of columns) {
      const base = row[column.baseColumn];
      const lookup = lookups[column.key];
      next[column.key] = base == null || !lookup ? null : (lookup[String(base)] ?? null);
    }
    return next;
  });
}

export type ForeignWriteTarget = {
  table: SheetKey;
  /** Coluna-chave da linha de destino (a mesma que a FK aponta). */
  keyColumn: string;
  id: string;
  column: string;
};

/**
 * Linha de destino de uma célula estrangeira: segue a FK base e cada salto até a
 * tabela onde a coluna mora. Null quando algum elo está vazio ou fora do cache.
 */
export function resolveForeignWriteTarget(
  column: ForeignColumn,
  row: Record<string, unknown>,
  getRows: RelationRowsProvider
): ForeignWriteTarget | null {
  let table = column.baseRelation.table;
  let keyColumn = column.baseRelation.keyColumn;
  let id = row[column.baseColumn];
  if (id == null || id === "") return null;

  for (const hop of column.resolved.hops) {
    const current = (getRows(table) ?? []).find((candidate) => String(candidate[keyColumn] ?? "") === String(id));
    if (!current) return null;
    id = current[hop.column];
    if (id == null || id === "") return null;
    table = hop.relation.table;
    keyColumn = hop.relation.keyColumn;
  }

  return { table, keyColumn, id: String(id), column: column.resolved.displayColumn };
}

export type ForeignWritePlan = {
  /** Atualizações por tabela de destino: { [keyColumn]: id, [coluna]: valor } (sem repetir linha). */
  byTable: Map<SheetKey, { keyColumn: string; rows: Map<string, Record<string, unknown>>; sources: Map<string, number> }>;
  /** Problemas por índice da linha de entrada. */
  errors: Array<{ index: number; error: string }>;
};

/**
 * Escrita avançada: distribui valores de colunas estrangeiras pelas tabelas de
 * destino. Cada entrada aponta a linha LOCAL (já carregada) e os valores.
 */
export function planForeignWrites(params: {
  entries: Array<{ index: number; row: Record<string, unknown> | null; values: Record<string, unknown> }>;
  columns: ForeignColumn[];
  getRows: RelationRowsProvider;
}): ForeignWritePlan {
  const byKey = new Map(params.columns.map((column) => [column.key, column]));
  const plan: ForeignWritePlan = { byTable: new Map(), errors: [] };

  for (const entry of params.entries) {
    if (!entry.row) {
      plan.errors.push({ index: entry.index, error: "Linha não encontrada no grid." });
      continue;
    }
    for (const [key, value] of Object.entries(entry.values)) {
      const column = byKey.get(key);
      if (!column) continue;
      const target = resolveForeignWriteTarget(column, entry.row, params.getRows);
      if (!target) {
        plan.errors.push({ index: entry.index, error: `${foreignColumnLabel(key)}: a linha não tem registro ligado.` });
        continue;
      }
      const bucket = plan.byTable.get(target.table) ?? { keyColumn: target.keyColumn, rows: new Map(), sources: new Map() };
      const update = bucket.rows.get(target.id) ?? { [target.keyColumn]: target.id };
      update[target.column] = value;
      bucket.rows.set(target.id, update);
      if (!bucket.sources.has(target.id)) bucket.sources.set(target.id, entry.index);
      plan.byTable.set(target.table, bucket);
    }
  }

  return plan;
}
