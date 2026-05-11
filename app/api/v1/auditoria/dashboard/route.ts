import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parseListPagination } from "@/lib/api/request";
import { endOfDayIso } from "@/lib/core/formatters";

// Bounded scan caps for the dropdown filter sources. The dashboard previously
// pulled every row from `log_alteracoes` to build these lists — that does not
// scale. Cap the scan to a sane window so the response stays predictable; the
// long-term fix is a dedicated aggregated view (see API notes below).
const FILTER_SAMPLE_LIMIT = 2000;

function normalizeAuditSearchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeAuditSearchMode(value: string) {
  switch (value) {
    case "contains":
    case "exact":
    case "starts":
    case "ends":
      return value;
    default:
      return "search";
  }
}

function normalizeAuditSortBy(value: string) {
  switch (value) {
    case "table":
    case "action":
    case "author":
      return value;
    default:
      return "createdAt";
  }
}

function normalizeAuditSortDir(value: string) {
  return value === "asc" ? "asc" : "desc";
}

function escapePostgrestLikeValue(value: string) {
  // PostgREST `or` / `ilike` parser splits on commas and uses `*` as the
  // wildcard token. Strip those characters so user input cannot break the
  // filter expression or widen the match unexpectedly.
  return value.replace(/[,*()]/g, " ").trim();
}

function buildSearchPattern(value: string, mode: "search" | "contains" | "exact" | "starts" | "ends") {
  const escaped = escapePostgrestLikeValue(value);
  if (!escaped) return null;

  switch (mode) {
    case "exact":
      return escaped;
    case "starts":
      return `${escaped}*`;
    case "ends":
      return `*${escaped}`;
    case "contains":
    case "search":
    default:
      return `*${escaped}*`;
  }
}

const SEARCHABLE_COLUMNS = ["autor", "autor_email", "tabela", "pk", "detalhes", "acao"] as const;

export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    const { page, pageSize, from, to } = parseListPagination(req, {
      defaultPageSize: 50,
      maxPageSize: 200
    });
    const tabela = (req.nextUrl.searchParams.get("tabela") ?? "").trim();
    const acao = (req.nextUrl.searchParams.get("acao") ?? "").trim();
    const autor = (req.nextUrl.searchParams.get("autor") ?? "").trim();
    const dateFrom = (req.nextUrl.searchParams.get("date_from") ?? "").trim();
    const dateTo = (req.nextUrl.searchParams.get("date_to") ?? "").trim();
    const search = normalizeAuditSearchTerm((req.nextUrl.searchParams.get("search") ?? "").trim());
    const searchMode = normalizeAuditSearchMode((req.nextUrl.searchParams.get("search_mode") ?? "").trim());
    const sortBy = normalizeAuditSortBy((req.nextUrl.searchParams.get("sort_by") ?? "").trim());
    const sortDir = normalizeAuditSortDir((req.nextUrl.searchParams.get("sort_dir") ?? "").trim());

    let rowsQuery = supabase.from("log_alteracoes").select("*", { count: "exact" });

    if (tabela) rowsQuery = rowsQuery.eq("tabela", tabela);
    if (acao) rowsQuery = rowsQuery.eq("acao", acao);
    if (autor) rowsQuery = rowsQuery.eq("autor", autor);
    if (dateFrom) rowsQuery = rowsQuery.gte("data_hora", `${dateFrom}T00:00:00`);
    if (dateTo) rowsQuery = rowsQuery.lte("data_hora", endOfDayIso(dateTo));

    if (search) {
      const pattern = buildSearchPattern(search, searchMode);
      if (pattern) {
        const orExpr = SEARCHABLE_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(",");
        rowsQuery = rowsQuery.or(orExpr);
      }
    }

    if (sortBy === "table") {
      rowsQuery = rowsQuery.order("tabela", { ascending: sortDir === "asc" }).order("data_hora", { ascending: false });
    } else if (sortBy === "action") {
      rowsQuery = rowsQuery.order("acao", { ascending: sortDir === "asc" }).order("data_hora", { ascending: false });
    } else if (sortBy === "author") {
      rowsQuery = rowsQuery.order("autor", { ascending: sortDir === "asc" }).order("data_hora", { ascending: false });
    } else {
      rowsQuery = rowsQuery.order("data_hora", { ascending: sortDir === "asc" });
    }

    const [
      { data: rows, error: rowsError, count },
      { data: actionRows, error: actionsError },
      { data: authorRows, error: authorsError },
      { data: tableRows, error: tablesError }
    ] = await Promise.all([
      rowsQuery.range(from, to),
      supabase
        .from("lookup_audit_actions")
        .select("code, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("log_alteracoes")
        .select("autor")
        .order("autor", { ascending: true })
        .range(0, FILTER_SAMPLE_LIMIT - 1),
      supabase
        .from("log_alteracoes")
        .select("tabela")
        .order("tabela", { ascending: true })
        .range(0, FILTER_SAMPLE_LIMIT - 1)
    ]);

    if (rowsError) {
      throw new ApiHttpError(500, "AUDIT_DASHBOARD_LIST_FAILED", "Falha ao carregar logs de auditoria.", rowsError);
    }

    if (actionsError) {
      throw new ApiHttpError(500, "AUDIT_ACTIONS_LIST_FAILED", "Falha ao carregar acoes de auditoria.", actionsError);
    }

    if (authorsError || tablesError) {
      throw new ApiHttpError(500, "AUDIT_FILTERS_LIST_FAILED", "Falha ao carregar filtros da auditoria.", authorsError ?? tablesError);
    }

    const actionLabelByCode = Object.fromEntries((actionRows ?? []).map((row) => [row.code, row.name]));
    const authors = Array.from(new Set((authorRows ?? []).map((row) => row.autor).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    const tables = Array.from(new Set((tableRows ?? []).map((row) => row.tabela).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    const total = count ?? 0;
    const items = (rows ?? []).map((row) => ({
      id: row.id,
      actionCode: row.acao,
      actionLabel: actionLabelByCode[row.acao] ?? row.acao,
      authorName: row.autor,
      authorRole: row.autor_cargo,
      authorEmail: row.autor_email,
      beforeData: row.dados_anteriores,
      afterData: row.dados_novos,
      batchId: row.lote_id,
      createdAt: row.data_hora,
      details: row.detalhes,
      inBatch: row.em_lote,
      pk: row.pk,
      table: row.tabela
    }));

    return apiOk(
      {
        filters: {
          actions: (actionRows ?? []).map((row) => ({ code: row.code, label: row.name })),
          authors,
          tables
        },
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          hasMore: page * pageSize < total
        },
        rows: items
      },
      {
        request_id: requestId,
        page,
        page_size: pageSize,
        total
      }
    );
  });
}
