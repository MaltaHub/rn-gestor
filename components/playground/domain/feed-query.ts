import type { GridFilters } from "@/components/ui-grid/types";
import type { PlaygroundFeedQuery } from "@/components/playground/types";

export const PLAYGROUND_DEFAULT_FEED_PAGE_SIZE = 50;

export const DEFAULT_PLAYGROUND_FEED_QUERY: PlaygroundFeedQuery = {
  query: "",
  matchMode: "contains",
  filters: {},
  sort: [],
  page: 1,
  pageSize: PLAYGROUND_DEFAULT_FEED_PAGE_SIZE
};

export function normalizeFeedQuery(query: Partial<PlaygroundFeedQuery> | null | undefined): PlaygroundFeedQuery {
  const page = Number(query?.page ?? DEFAULT_PLAYGROUND_FEED_QUERY.page);
  const pageSize = Number(query?.pageSize ?? DEFAULT_PLAYGROUND_FEED_QUERY.pageSize);
  const matchMode = query?.matchMode;
  const filters = query?.filters && typeof query.filters === "object" ? query.filters : {};
  const sort = Array.isArray(query?.sort)
    ? query.sort.filter((rule) => rule && typeof rule.column === "string" && (rule.dir === "asc" || rule.dir === "desc"))
    : [];

  return {
    query: typeof query?.query === "string" ? query.query : "",
    matchMode: matchMode === "exact" || matchMode === "starts" || matchMode === "ends" ? matchMode : "contains",
    filters: Object.fromEntries(
      Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
    ),
    sort,
    page: Number.isFinite(page) ? Math.max(1, Math.round(page)) : DEFAULT_PLAYGROUND_FEED_QUERY.page,
    pageSize: Number.isFinite(pageSize) ? Math.max(1, Math.min(200, Math.round(pageSize))) : DEFAULT_PLAYGROUND_FEED_QUERY.pageSize
  };
}

export function buildExactFilterExpression(valueLiteral: string) {
  const normalized = valueLiteral.trim();
  if (!normalized) return "";
  if (normalized.toUpperCase() === "VAZIO") return "VAZIO";
  if (normalized.toUpperCase() === "!VAZIO") return "!VAZIO";
  return `=${normalized}`;
}

export function buildExcludedValuesExpression(values: string[]) {
  const normalized = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (normalized.length === 0) return "";
  return `EXCETO ${normalized.join("|")}`;
}

export function withFeedFilter(query: PlaygroundFeedQuery, column: string, expression: string): PlaygroundFeedQuery {
  const nextFilters: GridFilters = { ...query.filters };
  const normalizedExpression = expression.trim();

  if (normalizedExpression) {
    nextFilters[column] = normalizedExpression;
  } else {
    delete nextFilters[column];
  }

  return {
    ...query,
    filters: nextFilters,
    page: 1
  };
}

export function parseFeedFilterSelection(expressionRaw: string): string[] {
  const expression = expressionRaw.trim();
  if (!expression) return [];
  if (expression.toUpperCase() === "VAZIO" || expression.toUpperCase() === "!VAZIO") {
    return [expression.toUpperCase()];
  }
  if (expression.toUpperCase().startsWith("EXCETO ")) {
    return [];
  }
  if (expression.startsWith("=")) {
    const value = expression.slice(1).trim();
    return value ? [value] : [];
  }
  if (expression.includes("|")) {
    return expression
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return expression ? [expression] : [];
}

export function buildFeedFilterExpressionFromSelection(values: string[]) {
  const normalized = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (normalized.length === 0) return "";
  if (normalized.length === 1) {
    const value = normalized[0];
    return value.toUpperCase() === "VAZIO" || value.toUpperCase() === "!VAZIO" ? value.toUpperCase() : `=${value}`;
  }
  return normalized.join("|");
}

export function withFeedFilterSelection(query: PlaygroundFeedQuery, column: string, values: string[]): PlaygroundFeedQuery {
  return withFeedFilter(query, column, buildFeedFilterExpressionFromSelection(values));
}

export function toggleFeedSort(query: PlaygroundFeedQuery, column: string, withChain: boolean): PlaygroundFeedQuery {
  const normalized = normalizeFeedQuery(query);
  const existingIndex = normalized.sort.findIndex((rule) => rule.column === column);
  let nextSort = [...normalized.sort];

  if (!withChain) {
    if (existingIndex === -1) {
      nextSort = [{ column, dir: "asc" }];
    } else if (normalized.sort[existingIndex].dir === "asc") {
      nextSort = [{ column, dir: "desc" }];
    } else {
      nextSort = [];
    }
  } else if (existingIndex === -1) {
    nextSort.push({ column, dir: "asc" });
  } else if (normalized.sort[existingIndex].dir === "asc") {
    nextSort[existingIndex] = { ...nextSort[existingIndex], dir: "desc" };
  } else {
    nextSort.splice(existingIndex, 1);
  }

  return normalizeFeedQuery({
    ...normalized,
    sort: nextSort,
    page: 1
  });
}

export function buildFragmentFeedQuery(params: {
  parentQuery: PlaygroundFeedQuery;
  sourceColumn: string;
  valueLiteral: string;
  fragmentQuery?: Partial<PlaygroundFeedQuery> | null;
}) {
  const parentQuery = normalizeFeedQuery(params.parentQuery);
  const fragmentQuery = normalizeFeedQuery(params.fragmentQuery);
  const filters = {
    ...parentQuery.filters,
    ...fragmentQuery.filters,
    [params.sourceColumn]: buildExactFilterExpression(params.valueLiteral)
  };

  return normalizeFeedQuery({
    ...parentQuery,
    ...fragmentQuery,
    filters,
    page: fragmentQuery.page
  });
}

export function buildParentFeedQueryExcludingFragments(params: {
  parentQuery: PlaygroundFeedQuery;
  sourceColumn: string;
  valueLiterals: string[];
}) {
  const parentQuery = normalizeFeedQuery(params.parentQuery);
  const expression = buildExcludedValuesExpression(params.valueLiterals);
  if (!expression) return parentQuery;

  return withFeedFilter(parentQuery, params.sourceColumn, expression);
}
