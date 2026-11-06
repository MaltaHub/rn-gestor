import type { SheetKey } from "@/components/ui-grid/types";
import { getRelationFor, RELATION_BY_SHEET_COLUMN } from "@/components/ui-grid/core/relations";
import { MAX_RELATION_PATH_DEPTH, RELATION_PATH_SEPARATOR, type RelationRowsProvider } from "@/components/ui-grid/core/relation-path";

/**
 * COLUNAS ESTRANGEIRAS: qualquer coluna de OUTRA tabela trazida para o grid,
 * ligada pelo grafo de FKs — nos DOIS sentidos.
 *
 * A chave é o caminho a partir da tabela do grid:
 *   salto direto   "carro_id"                   (FK desta tabela -> outra)
 *   salto inverso  "<notas_fiscais.carro_id"    (linhas de outra tabela que apontam para esta)
 *     com filtro   "<notas_fiscais.carro_id[tipo=ENTRADA]"
 *   último segmento = coluna exibida; "|agregação" quando o caminho é 1:N.
 * Exemplos (grid documentos):
 *   "carro_id>chassi"                                      -> carros.chassi
 *   "carro_id><notas_fiscais.carro_id[tipo=ENTRADA]>numero|ultimo"
 *
 * No cliente a coluna é MATERIALIZADA (row[chave] = valor), então busca,
 * filtros, ordenação, impressão e o leitor avançado funcionam sem código
 * especial. Escrever grava na linha de DESTINO (o servidor revalida tudo).
 */

export type ForeignAggregate = "ultimo" | "primeiro" | "lista" | "contagem";

export const FOREIGN_AGGREGATE_LABELS: Record<ForeignAggregate, string> = {
  ultimo: "último",
  primeiro: "primeiro",
  lista: "todos (lista)",
  contagem: "quantidade"
};

export type ForeignWhere = { column: string; value: string };

export type ForeignHop =
  | { kind: "forward"; fromTable: SheetKey; column: string; toTable: SheetKey; keyColumn: string }
  | {
      kind: "reverse";
      fromTable: SheetKey;
      /** Tabela cujas linhas apontam para `fromTable`. */
      toTable: SheetKey;
      /** FK em `toTable` que aponta para `fromTable`. */
      column: string;
      /** Coluna de `fromTable` que a FK referencia. */
      keyColumn: string;
      where: ForeignWhere | null;
    };

export type ForeignColumn = {
  key: string;
  hops: ForeignHop[];
  displayTable: SheetKey;
  displayColumn: string;
  /** Caminho com salto inverso (pode trazer várias linhas). */
  multi: boolean;
  aggregate: ForeignAggregate | null;
  /** Tabelas que precisam estar no cache para resolver o valor. */
  tables: SheetKey[];
};

const AGGREGATES: ForeignAggregate[] = ["ultimo", "primeiro", "lista", "contagem"];

export function isForeignColumnKey(column: string): boolean {
  return typeof column === "string" && column.includes(RELATION_PATH_SEPARATOR);
}

function parseReverseSegment(segment: string): { table: string; column: string; where: ForeignWhere | null } | null {
  const match = /^<([a-z0-9_]+)\.([a-z0-9_]+)(?:\[([a-z0-9_]+)=([^\]]*)\])?$/.exec(segment);
  if (!match) return null;
  const [, table, column, whereColumn, whereValue] = match;
  return { table, column, where: whereColumn ? { column: whereColumn, value: decodeURIComponent(whereValue ?? "") } : null };
}

export function formatReverseSegment(table: string, column: string, where?: ForeignWhere | null): string {
  return `<${table}.${column}${where ? `[${where.column}=${encodeURIComponent(where.value)}]` : ""}`;
}

/** Interpreta a chave a partir da tabela do grid. Null = caminho inválido. */
export function parseForeignColumn(sheetKey: SheetKey, key: string): ForeignColumn | null {
  if (!isForeignColumnKey(key)) return null;
  const [pathPart, aggregatePart] = key.split("|", 2);
  const segments = pathPart
    .split(RELATION_PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2 || segments.length - 1 > MAX_RELATION_PATH_DEPTH) return null;

  const hops: ForeignHop[] = [];
  let current: SheetKey = sheetKey;
  for (const segment of segments.slice(0, -1)) {
    if (segment.startsWith("<")) {
      const reverse = parseReverseSegment(segment);
      if (!reverse) return null;
      const relation = getRelationFor(reverse.table as SheetKey, reverse.column);
      if (!relation || relation.table !== current) return null;
      hops.push({
        kind: "reverse",
        fromTable: current,
        toTable: reverse.table as SheetKey,
        column: reverse.column,
        keyColumn: relation.keyColumn,
        where: reverse.where
      });
      current = reverse.table as SheetKey;
    } else {
      const relation = getRelationFor(current, segment);
      if (!relation) return null;
      hops.push({ kind: "forward", fromTable: current, column: segment, toTable: relation.table, keyColumn: relation.keyColumn });
      current = relation.table;
    }
  }

  const displayColumn = segments[segments.length - 1];
  if (displayColumn.startsWith("<") || !/^[a-z0-9_]+$/.test(displayColumn)) return null;
  const multi = hops.some((hop) => hop.kind === "reverse");
  const aggregate = multi ? (AGGREGATES.find((entry) => entry === aggregatePart?.trim()) ?? "ultimo") : null;
  const normalized = segments.join(RELATION_PATH_SEPARATOR) + (aggregate ? `|${aggregate}` : "");
  return {
    key: normalized,
    hops,
    displayTable: current,
    displayColumn,
    multi,
    aggregate,
    tables: Array.from(new Set(hops.map((hop) => hop.toTable)))
  };
}

/** Coluna do grid de onde o caminho sai (FK do primeiro salto direto), para posicionar a coluna nova. */
export function foreignAnchorColumn(column: ForeignColumn): string | null {
  const first = column.hops[0];
  return first?.kind === "forward" ? first.column : null;
}

/** Rótulo curto do cabeçalho: "carros.chassi", "notas_fiscais.numero · ENTRADA (último)". */
export function foreignColumnShortLabel(column: ForeignColumn): string {
  const where = column.hops.find((hop): hop is Extract<ForeignHop, { kind: "reverse" }> => hop.kind === "reverse" && Boolean(hop.where))?.where;
  return `${column.displayTable}.${column.displayColumn}${where ? ` · ${where.value}` : ""}${
    column.aggregate ? ` (${FOREIGN_AGGREGATE_LABELS[column.aggregate]})` : ""
  }`;
}

/** Caminho legível (dica do cabeçalho): "documentos › carros › notas_fiscais (tipo = ENTRADA) › numero". */
export function describeForeignColumn(sheetKey: SheetKey, column: ForeignColumn): string {
  const parts: string[] = [sheetKey];
  for (const hop of column.hops) {
    parts.push(hop.kind === "reverse" && hop.where ? `${hop.toTable} (${hop.where.column} = ${hop.where.value})` : hop.toTable);
  }
  return `${parts.join(" › ")} › ${column.displayColumn}`;
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

// ------------------------------------------------------------- resolução

type RowIndexCache = Map<string, Map<string, Array<Record<string, unknown>>>>;

function indexRows(table: SheetKey, column: string, getRows: RelationRowsProvider, cache: RowIndexCache) {
  const cacheKey = `${table}::${column}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const rows = getRows(table);
  if (!rows) return null;
  const index = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const value = row[column];
    if (value == null || value === "") continue;
    const key = String(value);
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  cache.set(cacheKey, index);
  return index;
}

/**
 * Linhas alcançadas pelo caminho a partir de uma linha do grid. Null quando
 * alguma tabela do caminho ainda não está no cache (o valor fica vazio).
 */
export function resolveForeignRows(
  column: ForeignColumn,
  row: Record<string, unknown>,
  getRows: RelationRowsProvider,
  cache: RowIndexCache = new Map()
): Array<Record<string, unknown>> | null {
  let current: Array<Record<string, unknown>> = [row];
  for (const hop of column.hops) {
    const next: Array<Record<string, unknown>> = [];
    if (hop.kind === "forward") {
      const index = indexRows(hop.toTable, hop.keyColumn, getRows, cache);
      if (!index) return null;
      for (const item of current) {
        const value = item[hop.column];
        if (value == null || value === "") continue;
        const target = index.get(String(value))?.[0];
        if (target) next.push(target);
      }
    } else {
      const index = indexRows(hop.toTable, hop.column, getRows, cache);
      if (!index) return null;
      for (const item of current) {
        const value = item[hop.keyColumn];
        if (value == null || value === "") continue;
        for (const child of index.get(String(value)) ?? []) {
          if (hop.where && String(child[hop.where.column] ?? "") !== hop.where.value) continue;
          next.push(child);
        }
      }
    }
    current = next;
    if (current.length === 0) return current;
  }
  return current;
}

function createdOrder(rows: Array<Record<string, unknown>>) {
  return [...rows].sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")));
}

/** Linha escolhida pela agregação (último/primeiro); null em lista/contagem. */
function pickRow(column: ForeignColumn, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return null;
  if (!column.multi) return rows[0];
  if (column.aggregate === "lista" || column.aggregate === "contagem") return null;
  const ordered = createdOrder(rows);
  return column.aggregate === "primeiro" ? ordered[0] : ordered[ordered.length - 1];
}

export function aggregateForeignValue(column: ForeignColumn, rows: Array<Record<string, unknown>> | null): unknown {
  if (!rows) return null;
  if (column.multi && column.aggregate === "contagem") return rows.length;
  if (column.multi && column.aggregate === "lista") {
    const values = Array.from(
      new Set(
        createdOrder(rows)
          .map((row) => row[column.displayColumn])
          .filter((value) => value != null && value !== "")
          .map((value) => String(value))
      )
    );
    return values.length > 0 ? values.join(", ") : null;
  }
  return pickRow(column, rows)?.[column.displayColumn] ?? null;
}

/** Linhas com as colunas estrangeiras preenchidas (as mesmas linhas quando não há nenhuma). */
export function materializeForeignColumns(
  rows: Array<Record<string, unknown>>,
  columns: ForeignColumn[],
  getRows: RelationRowsProvider
): Array<Record<string, unknown>> {
  if (columns.length === 0) return rows;
  const cache: RowIndexCache = new Map();
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const column of columns) {
      next[column.key] = aggregateForeignValue(column, resolveForeignRows(column, row, getRows, cache));
    }
    return next;
  });
}

// ------------------------------------------------------------- escrita

/**
 * Colunas que NÃO se editam por coluna estrangeira: têm fluxo próprio no cliente
 * (estado_venda abre a venda/conflito de venda no grid de carros).
 */
const FOREIGN_READ_ONLY: Partial<Record<SheetKey, string[]>> = {
  carros: ["estado_venda"]
};

/** Só leitura: lista/quantidade (não há uma linha só) ou coluna com fluxo próprio. */
export function isForeignColumnReadOnly(column: ForeignColumn): boolean {
  if (column.multi && (column.aggregate === "lista" || column.aggregate === "contagem")) return true;
  return (FOREIGN_READ_ONLY[column.displayTable] ?? []).includes(column.displayColumn);
}

export type ForeignWriteTarget = {
  table: SheetKey;
  /** Coluna-chave da linha de destino (FK alvo no salto direto; PK no inverso). */
  keyColumn: string;
  id: string;
  column: string;
};

export type PrimaryKeyOf = (table: SheetKey) => string | null;

/** Linha de destino de uma célula estrangeira. Null = sem registro ligado ou não editável. */
export function resolveForeignWriteTarget(
  column: ForeignColumn,
  row: Record<string, unknown>,
  getRows: RelationRowsProvider,
  primaryKeyOf: PrimaryKeyOf
): ForeignWriteTarget | null {
  if (isForeignColumnReadOnly(column)) return null;
  const target = pickRow(column, resolveForeignRows(column, row, getRows) ?? []);
  if (!target) return null;
  const last = column.hops[column.hops.length - 1];
  const keyColumn = last.kind === "forward" ? last.keyColumn : primaryKeyOf(column.displayTable);
  if (!keyColumn) return null;
  const id = target[keyColumn];
  if (id == null || id === "") return null;
  return { table: column.displayTable, keyColumn, id: String(id), column: column.displayColumn };
}

export type ForeignWritePlan = {
  byTable: Map<SheetKey, { keyColumn: string; rows: Map<string, Record<string, unknown>>; sources: Map<string, number> }>;
  errors: Array<{ index: number; error: string }>;
};

/** Escrita avançada: distribui valores de colunas estrangeiras pelas tabelas de destino. */
export function planForeignWrites(params: {
  entries: Array<{ index: number; row: Record<string, unknown> | null; values: Record<string, unknown> }>;
  columns: ForeignColumn[];
  getRows: RelationRowsProvider;
  primaryKeyOf: PrimaryKeyOf;
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
      const target = resolveForeignWriteTarget(column, entry.row, params.getRows, params.primaryKeyOf);
      if (!target) {
        plan.errors.push({ index: entry.index, error: `${foreignColumnShortLabel(column)}: sem registro ligado (ou coluna só de leitura).` });
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

// ------------------------------------------------------------- caminhos

export type ForeignPath = {
  /** Segmentos do caminho (sem a coluna final). */
  segments: string[];
  /** Tabelas atravessadas (sem a de origem). */
  tables: SheetKey[];
  multi: boolean;
};

/**
 * Caminhos mais curtos do grid até a tabela escolhida, andando pelas FKs nos
 * dois sentidos (diretos primeiro: valor único e editável).
 */
export function findForeignPaths(params: {
  from: SheetKey;
  to: SheetKey;
  readable: (table: SheetKey) => boolean;
  maxDepth?: number;
  limit?: number;
}): ForeignPath[] {
  const maxDepth = params.maxDepth ?? 3;
  const limit = params.limit ?? 6;
  const relationEntries = Object.entries(RELATION_BY_SHEET_COLUMN) as Array<[SheetKey, Record<string, { table: SheetKey }>]>;
  const found: ForeignPath[] = [];
  let frontier: Array<{ table: SheetKey; segments: string[]; tables: SheetKey[] }> = [{ table: params.from, segments: [], tables: [] }];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: typeof frontier = [];
    for (const state of frontier) {
      const visited = new Set<SheetKey>([params.from, ...state.tables]);
      const edges: Array<{ segment: string; table: SheetKey }> = [];
      for (const [column, relation] of Object.entries(RELATION_BY_SHEET_COLUMN[state.table] ?? {})) {
        edges.push({ segment: column, table: relation.table });
      }
      for (const [source, map] of relationEntries) {
        for (const [column, relation] of Object.entries(map)) {
          if (relation.table === state.table) edges.push({ segment: formatReverseSegment(source, column), table: source });
        }
      }
      for (const edge of edges) {
        if (visited.has(edge.table) || !params.readable(edge.table)) continue;
        const segments = [...state.segments, edge.segment];
        const tables = [...state.tables, edge.table];
        if (edge.table === params.to) {
          found.push({ segments, tables, multi: segments.some((segment) => segment.startsWith("<")) });
        } else {
          next.push({ table: edge.table, segments, tables });
        }
      }
    }
    // Para no primeiro nível que achou algo (caminhos mais curtos).
    if (found.length > 0) break;
    frontier = next;
  }

  return found.sort((left, right) => Number(left.multi) - Number(right.multi)).slice(0, limit);
}
