import { toDisplay, toEditable } from "@/components/ui-grid/value-format";
import type { GridListPayload, SheetKey } from "@/components/ui-grid/types";
import { buildRelationPathLookup, collectRelationPathTables } from "@/components/ui-grid/core/relation-path";
import { RELATION_BY_SHEET_COLUMN } from "@/components/ui-grid/core/relations";

export type FilterOption = {
  literal: string;
  label: string;
  count: number;
  sortValue: string;
};

// Reexportados: a definicao vive em core/relations para que core/relation-path
// possa consumi-la sem import circular.
export { RELATION_BY_SHEET_COLUMN, getRelationFor } from "@/components/ui-grid/core/relations";
export type { RelationRef } from "@/components/ui-grid/core/relations";

export const EMPTY_FILTER_LITERAL = "VAZIO";
export const EMPTY_FILTER_LABEL = "(vazio)";
export const DATE_FILTER_LITERAL_PREFIX = "__DATE__:";

export function normalizeComparableNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareNullableTimestampsAsc(left: unknown, right: unknown) {
  const normalizeComparableTimestamp = (value: unknown) => {
    if (value == null || value === "") return null;
    const timestamp = new Date(String(value)).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const leftValue = normalizeComparableTimestamp(left);
  const rightValue = normalizeComparableTimestamp(right);

  if (leftValue == null && rightValue == null) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;
  return leftValue - rightValue;
}

function compareNullableTextAsc(left: unknown, right: unknown) {
  const leftValue = String(left ?? "").trim();
  const rightValue = String(right ?? "").trim();
  return leftValue.localeCompare(rightValue, "pt-BR", { sensitivity: "base" });
}

export function buildRepeatedPriceBucketKey(value: unknown) {
  const comparable = normalizeComparableNumber(value);
  return comparable == null ? "__sem_preco__" : String(comparable);
}

export function buildRepeatedPriceBucketLabel(value: unknown) {
  return buildRepeatedPriceBucketKey(value) === "__sem_preco__"
    ? "Faixa sem preco"
    : `Faixa ${toDisplay(value, "preco_original")}`;
}

export function compareRepeatedVehicleReferencePriority(left: Record<string, unknown>, right: Record<string, unknown>) {
  if (left.__has_anuncio === true && right.__has_anuncio !== true) return -1;
  if (left.__has_anuncio !== true && right.__has_anuncio === true) return 1;

  const byEntryDate = compareNullableTimestampsAsc(left.data_entrada, right.data_entrada);
  if (byEntryDate !== 0) return byEntryDate;

  const byCreatedAt = compareNullableTimestampsAsc(left.created_at, right.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  return compareNullableTextAsc(left.carro_id ?? left.id, right.carro_id ?? right.id);
}

/**
 * Mapa `coluna -> (chave -> valor exibido)` do sheet ativo.
 *
 * Cada override e um CAMINHO de expansao (ver core/relation-path): um nome de
 * coluna sozinho e o caminho de um salto — o comportamento historico —, e
 * `"modelo_id>marca_id>nome"` atravessa quantas FKs forem precisas. Por isso
 * nao ha limite de profundidade nas construcoes: quem exibe nao sabe (nem
 * precisa saber) quantos saltos o caminho tem.
 */
export function buildRelationDisplayLookup(
  sheetKey: SheetKey,
  displayColumnOverrides: Record<string, string>,
  relationCache: Partial<Record<SheetKey, GridListPayload>>
) {
  const lookup: Record<string, Record<string, unknown>> = {};
  const relationMap = RELATION_BY_SHEET_COLUMN[sheetKey] ?? {};
  const getRows = (table: SheetKey) => relationCache[table]?.rows ?? null;

  for (const [column, relation] of Object.entries(relationMap)) {
    const selectedDisplayPath = displayColumnOverrides[column];
    if (!selectedDisplayPath) continue;

    const bucket = buildRelationPathLookup({ baseRelation: relation, path: selectedDisplayPath, getRows });
    // null = caminho invalido ou tabela do caminho ainda nao carregada. Sem
    // entrada no mapa, a celula mostra o valor cru em vez de ficar vazia.
    if (!bucket) continue;

    lookup[column] = bucket;
  }

  return lookup;
}

/**
 * Toda tabela que precisa estar no cache de relacoes para o sheet renderizar
 * sem id cru: as FKs diretas do sheet + cada salto dos caminhos de expansao.
 */
export function collectRequiredRelationTables(params: {
  sheetKey: SheetKey;
  displayColumnOverrides: Array<Record<string, string>>;
}): SheetKey[] {
  const relationMap = RELATION_BY_SHEET_COLUMN[params.sheetKey] ?? {};
  const tables = new Set<SheetKey>();

  for (const relation of Object.values(relationMap)) {
    tables.add(relation.table);
  }

  for (const overrides of params.displayColumnOverrides) {
    for (const [column, path] of Object.entries(overrides)) {
      const relation = relationMap[column];
      if (!relation) continue;
      for (const table of collectRelationPathTables(relation, path)) {
        tables.add(table);
      }
    }
  }

  return Array.from(tables);
}

export function resolveDisplayValueFromLookup(
  row: Record<string, unknown>,
  column: string,
  relationDisplayLookup: Record<string, Record<string, unknown>>
) {
  const mapForColumn = relationDisplayLookup[column];
  if (!mapForColumn) return row[column];

  const raw = row[column];
  if (raw == null) return raw;

  const key = String(raw);
  if (!(key in mapForColumn)) return raw;
  return mapForColumn[key];
}

export function toLocalDateFilterKey(value: unknown, column: string) {
  if (value == null) return null;

  const looksLikeDateColumn =
    column.startsWith("data") || column.endsWith("_data") || column.endsWith("_at") || column.endsWith("_em");

  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  if (!looksLikeDateColumn) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function toDateFilterLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

export function getDateFilterKey(value: string) {
  return value.startsWith(DATE_FILTER_LITERAL_PREFIX) ? value.slice(DATE_FILTER_LITERAL_PREFIX.length) : null;
}

export function toFilterSelectionLabel(value: string) {
  if (value.toUpperCase() === EMPTY_FILTER_LITERAL) return EMPTY_FILTER_LABEL;
  if (value.toUpperCase() === "!VAZIO") return "preenchido";

  const dateKey = getDateFilterKey(value);
  if (dateKey) return toDateFilterLabel(dateKey);

  return value;
}

export function getDateSelectionBounds(values: string[]) {
  const keys = values.map(getDateFilterKey).filter((value): value is string => Boolean(value)).sort();
  if (keys.length === 0) {
    return { from: "", to: "" };
  }

  return {
    from: keys[0],
    to: keys[keys.length - 1]
  };
}

export function selectDateFilterRange(options: FilterOption[], from: string, to: string) {
  const fromKey = from.trim();
  const toKey = to.trim();

  return options
    .filter((option) => {
      const dateKey = getDateFilterKey(option.literal);
      if (!dateKey) return false;
      if (fromKey && dateKey < fromKey) return false;
      if (toKey && dateKey > toKey) return false;
      return true;
    })
    .map((option) => option.literal);
}

export function buildColumnFilterOptions(params: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  relationDisplayLookup: Record<string, Record<string, unknown>>;
}) {
  const options: Record<string, FilterOption[]> = {};

  for (const column of params.columns) {
    const bucket = new Map<string, { label: string; count: number; sortValue: string }>();
    const relationMap = params.relationDisplayLookup[column];
    let emptyCount = 0;

    for (const row of params.rows) {
      const raw = row[column];
      if (raw == null || raw === "") {
        emptyCount += 1;
        continue;
      }

      const resolvedValue = relationMap ? (relationMap[String(raw)] ?? raw) : raw;
      const dateKey = toLocalDateFilterKey(raw, column);
      const literal = dateKey ? `${DATE_FILTER_LITERAL_PREFIX}${dateKey}` : toEditable(raw);
      const label = dateKey ? toDateFilterLabel(dateKey) : toDisplay(resolvedValue, column);
      const sortValue = dateKey ? dateKey : toEditable(resolvedValue).toLocaleLowerCase("pt-BR");
      const existing = bucket.get(literal);

      if (existing) {
        existing.count += 1;
      } else {
        bucket.set(literal, { label, count: 1, sortValue });
      }
    }

    options[column] = Array.from(bucket.entries())
      .map(([literal, meta]) => ({
        literal,
        label: meta.label,
        count: meta.count,
        sortValue: meta.sortValue
      }))
      .sort((a, b) => {
        const aDateKey = getDateFilterKey(a.literal);
        const bDateKey = getDateFilterKey(b.literal);

        if (aDateKey && bDateKey) {
          return b.sortValue.localeCompare(a.sortValue, "pt-BR", { sensitivity: "base" });
        }

        return a.sortValue.localeCompare(b.sortValue, "pt-BR", { sensitivity: "base", numeric: true });
      });

    if (emptyCount > 0) {
      options[column].unshift({
        literal: EMPTY_FILTER_LITERAL,
        label: EMPTY_FILTER_LABEL,
        count: emptyCount,
        sortValue: ""
      });
    }
  }

  return options;
}
