import type { GridFilters, SortRule } from "@/components/ui-grid/types";
import { normalizeBulkToken, toDisplay, toEditable } from "@/components/ui-grid/value-format";

export type FrontGridMatchMode = "contains" | "exact" | "starts" | "ends";
const DATE_FILTER_LITERAL_PREFIX = "__DATE__:";

function toLocalDateFilterKey(value: unknown) {
  if (value == null) return null;

  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function parseFilterPrimitive(value: string): string | number | boolean {
  const normalized = value.trim();
  if (normalized.toLowerCase() === "true") return true;
  if (normalized.toLowerCase() === "false") return false;
  if (normalized !== "" && !Number.isNaN(Number(normalized))) return Number(normalized);
  return normalized;
}

function compareFilterValue(candidate: unknown, target: string | number | boolean) {
  if (candidate == null) return false;

  if (typeof target === "number") {
    const parsed = typeof candidate === "number" ? candidate : Number(String(candidate));
    return !Number.isNaN(parsed) && parsed === target;
  }

  if (typeof target === "boolean") {
    if (typeof candidate === "boolean") return candidate === target;
    const normalized = normalizeBulkToken(String(candidate));
    return target
      ? ["true", "1", "sim", "s", "yes", "y"].includes(normalized)
      : ["false", "0", "nao", "n", "no"].includes(normalized);
  }

  return normalizeBulkToken(String(candidate)) === normalizeBulkToken(target);
}

function compareSortableValues(left: unknown, right: unknown) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  const leftString = String(left);
  const rightString = String(right);
  const leftNumber = Number(leftString);
  const rightNumber = Number(rightString);

  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return leftString.localeCompare(rightString, "pt-BR", {
    numeric: true,
    sensitivity: "base"
  });
}

function matchesPattern(candidate: string, search: string, mode: FrontGridMatchMode) {
  const haystack = normalizeBulkToken(candidate);
  const needle = normalizeBulkToken(search);
  if (!needle) return true;
  if (mode === "exact") return haystack === needle;
  if (mode === "starts") return haystack.startsWith(needle);
  if (mode === "ends") return haystack.endsWith(needle);
  return haystack.includes(needle);
}

function matchesExactOrSpecialFilter(value: unknown, entryRaw: string) {
  const entry = entryRaw.trim();
  if (!entry) return false;

  if (entry.startsWith(DATE_FILTER_LITERAL_PREFIX)) {
    return toLocalDateFilterKey(value) === entry.slice(DATE_FILTER_LITERAL_PREFIX.length);
  }

  if (entry.toUpperCase() === "VAZIO") {
    return value == null || String(value).trim() === "";
  }

  if (entry.toUpperCase() === "!VAZIO") {
    return value != null && String(value).trim() !== "";
  }

  return compareFilterValue(value, parseFilterPrimitive(entry));
}

export function matchesFrontFilterExpression(value: unknown, expressionRaw: string) {
  const expression = expressionRaw.trim();
  if (!expression) return true;

  if (expression.toUpperCase() === "VAZIO") {
    return value == null || String(value).trim() === "";
  }

  if (expression.toUpperCase() === "!VAZIO") {
    return value != null && String(value).trim() !== "";
  }

  if (expression.toUpperCase().startsWith("EXCETO ")) {
    return !compareFilterValue(value, parseFilterPrimitive(expression.slice(7)));
  }

  const numericCandidate =
    typeof value === "number" ? value : value == null || String(value).trim() === "" ? Number.NaN : Number(String(value));

  if (expression.startsWith(">=")) {
    const parsed = Number(expression.slice(2).trim());
    return !Number.isNaN(parsed) && !Number.isNaN(numericCandidate) && numericCandidate >= parsed;
  }

  if (expression.startsWith("<=")) {
    const parsed = Number(expression.slice(2).trim());
    return !Number.isNaN(parsed) && !Number.isNaN(numericCandidate) && numericCandidate <= parsed;
  }

  if (expression.startsWith(">")) {
    const parsed = Number(expression.slice(1).trim());
    return !Number.isNaN(parsed) && !Number.isNaN(numericCandidate) && numericCandidate > parsed;
  }

  if (expression.startsWith("<")) {
    const parsed = Number(expression.slice(1).trim());
    return !Number.isNaN(parsed) && !Number.isNaN(numericCandidate) && numericCandidate < parsed;
  }

  if (expression.startsWith("!=")) {
    return !compareFilterValue(value, parseFilterPrimitive(expression.slice(2)));
  }

  if (expression.startsWith("=")) {
    return matchesExactOrSpecialFilter(value, expression.slice(1));
  }

  if (expression.includes("|")) {
    return expression
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .some((entry) => matchesExactOrSpecialFilter(value, entry));
  }

  return matchesPattern(toEditable(value), expression, "contains");
}

export function filterRowsByQuery(params: {
  columns: string[];
  matchMode: FrontGridMatchMode;
  query: string;
  rows: Array<Record<string, unknown>>;
  resolveDisplayValue: (row: Record<string, unknown>, column: string) => unknown;
}) {
  if (!params.query.trim()) {
    return params.rows;
  }

  return params.rows.filter((row) =>
    params.columns.some((column) => {
      const displayValue = params.resolveDisplayValue(row, column);
      return (
        matchesPattern(toDisplay(displayValue, column), params.query, params.matchMode) ||
        matchesPattern(toEditable(row[column]), params.query, params.matchMode)
      );
    })
  );
}

export function applyFrontFiltersAndSort(params: {
  filters: GridFilters;
  resolveDisplayValue: (row: Record<string, unknown>, column: string) => unknown;
  rows: Array<Record<string, unknown>>;
  sortChain: SortRule[];
}) {
  const filtered = params.rows.filter((row) => {
    for (const [column, expression] of Object.entries(params.filters)) {
      if (!matchesFrontFilterExpression(row[column], expression)) {
        return false;
      }
    }

    return true;
  });

  if (params.sortChain.length === 0) {
    return filtered;
  }

  return [...filtered].sort((left, right) => {
    for (const rule of params.sortChain) {
      const leftValue = params.resolveDisplayValue(left, rule.column);
      const rightValue = params.resolveDisplayValue(right, rule.column);
      const comparison = compareSortableValues(leftValue, rightValue);

      if (comparison !== 0) {
        return rule.dir === "asc" ? comparison : comparison * -1;
      }
    }

    return 0;
  });
}
