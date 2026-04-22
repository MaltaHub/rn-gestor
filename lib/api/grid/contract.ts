import type { NextRequest } from "next/server";
import { createGridContractError } from "@/lib/api/errors";
import type { GridFilters, GridSortRule, GridTableConfig } from "@/lib/api/grid-config";
import { assertAllowedWritePayload, resolveGridWritePolicy } from "@/lib/api/grid/policy";
import type { GridContractInput, GridMatchMode, GridRequestContract, GridRowPayload } from "@/lib/api/grid/types";

const MATCH_MODES: GridMatchMode[] = ["contains", "exact", "starts", "ends"];

function parseJsonOrThrow(raw: string, code: "GRID_CONTRACT_INVALID_QUERY" | "GRID_CONTRACT_INVALID_BODY", details: unknown) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw createGridContractError(code, "JSON invalido no contrato da requisicao.", details);
  }
}

export function parseGridRequestContractInput(input: GridContractInput, config: GridTableConfig): GridRequestContract {
  const pageRaw = Number(input.searchParams.get("page") ?? 1);
  const pageSizeRaw = Number(input.searchParams.get("pageSize") ?? input.searchParams.get("page_size") ?? 50);
  if (!Number.isFinite(pageRaw) || !Number.isFinite(pageSizeRaw)) {
    throw createGridContractError("GRID_CONTRACT_INVALID_QUERY", "Paginacao invalida.");
  }

  const page = Math.max(1, pageRaw);
  const pageSize = Math.min(200, Math.max(1, pageSizeRaw));
  const queryText = (input.searchParams.get("query") ?? "").trim();

  const rawMatchMode = (input.searchParams.get("matchMode") ?? "contains").trim();
  if (!MATCH_MODES.includes(rawMatchMode as GridMatchMode)) {
    throw createGridContractError("GRID_CONTRACT_INVALID_MATCH_MODE", "Modo de busca invalido.", {
      matchMode: rawMatchMode,
      allowed: MATCH_MODES
    });
  }
  const matchMode = rawMatchMode as GridMatchMode;

  const sortable = new Set(config.sortableColumns);
  const filterable = new Set(config.filterableColumns);

  const sortRaw = input.searchParams.get("sort");
  const sort: GridSortRule[] = [];
  if (sortRaw) {
    const parsed = parseJsonOrThrow(sortRaw, "GRID_CONTRACT_INVALID_QUERY", { field: "sort" });
    if (!Array.isArray(parsed)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_SORT", "Ordenacao invalida.", { sort: parsed });
    }

    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        throw createGridContractError("GRID_CONTRACT_INVALID_SORT", "Ordenacao invalida.", { item });
      }
      const column = (item as { column?: unknown }).column;
      const dir = (item as { dir?: unknown }).dir;
      if (typeof column !== "string" || (dir !== "asc" && dir !== "desc") || !sortable.has(column)) {
        throw createGridContractError("GRID_CONTRACT_INVALID_SORT", "Ordenacao nao permitida para coluna.", {
          item,
          sortableColumns: config.sortableColumns
        });
      }
      sort.push({ column, dir });
    }
  }

  const filtersRaw = input.searchParams.get("filters");
  const filters: GridFilters = {};
  if (filtersRaw) {
    const parsed = parseJsonOrThrow(filtersRaw, "GRID_CONTRACT_INVALID_QUERY", { field: "filters" });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_FILTER", "Filtro invalido.", { filters: parsed });
    }

    for (const [column, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!filterable.has(column)) {
        throw createGridContractError("GRID_CONTRACT_INVALID_FILTER", "Filtro nao permitido para coluna.", {
          column,
          filterableColumns: config.filterableColumns
        });
      }
      if (typeof value !== "string") {
        throw createGridContractError("GRID_CONTRACT_INVALID_FILTER", "Filtro deve ser texto.", { column, value });
      }
      filters[column] = value.trim();
    }
  }

  let body: GridRequestContract["body"] = null;
  if (input.method === "POST") {
    const rawBody = input.body;

    if (!rawBody || typeof rawBody !== "object" || !("row" in rawBody)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Payload esperado: { row: {...} }.");
    }

    const row = (rawBody as { row?: unknown }).row;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Payload esperado: { row: {...} }.");
    }

    const policy = resolveGridWritePolicy(config);
    assertAllowedWritePayload(row as GridRowPayload, policy, config);

    body = {
      row: row as GridRowPayload,
      priceChangeContext:
        typeof (rawBody as { priceChangeContext?: unknown }).priceChangeContext === "string"
          ? (rawBody as { priceChangeContext?: string }).priceChangeContext
          : undefined
    };
  }

  return { page, pageSize, queryText, matchMode, sort, filters, body };
}

export async function parseGridRequestContract(req: NextRequest, config: GridTableConfig): Promise<GridRequestContract> {
  let body: unknown;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      throw createGridContractError("GRID_CONTRACT_INVALID_BODY", "Body JSON invalido.");
    }
  }

  return parseGridRequestContractInput(
    {
      method: req.method,
      searchParams: req.nextUrl.searchParams,
      body
    },
    config
  );
}
