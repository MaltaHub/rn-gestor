import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";

function endOfDayIso(date: string) {
  return `${date}T23:59:59.999`;
}

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

function normalizeSearchText(value: unknown) {
  if (value == null) return "";

  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);

  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildAuditRowSearchText(
  row: {
    acao: string | null;
    autor: string | null;
    autor_cargo: string | null;
    autor_email: string | null;
    dados_anteriores: unknown;
    dados_novos: unknown;
    data_hora: string;
    detalhes: string | null;
    pk: string | null;
    tabela: string | null;
  },
  actionLabel: string
) {
  return normalizeSearchText(
    [
      actionLabel,
      row.acao,
      row.autor,
      row.autor_cargo,
      row.autor_email,
      row.detalhes,
      row.pk,
      row.tabela,
      row.data_hora,
      row.dados_anteriores,
      row.dados_novos
    ]
      .map((value) => {
        if (typeof value === "string") return value;
        if (value == null) return "";
        return JSON.stringify(value);
      })
      .join(" ")
  );
}

function matchesAuditSearch(text: string, search: string, mode: "search" | "contains" | "exact" | "starts" | "ends") {
  if (!search) return true;

  switch (mode) {
    case "contains":
      return text.includes(search);
    case "exact":
      return text === search;
    case "starts":
      return text.startsWith(search);
    case "ends":
      return text.endsWith(search);
    case "search":
    default: {
      const tokens = search.split(/\s+/).filter(Boolean);
      return tokens.every((token) => text.includes(token));
    }
  }
}

export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    const { page, pageSize, from, to } = parsePagination(req);
    const tabela = (req.nextUrl.searchParams.get("tabela") ?? "").trim();
    const acao = (req.nextUrl.searchParams.get("acao") ?? "").trim();
    const autor = (req.nextUrl.searchParams.get("autor") ?? "").trim();
    const dateFrom = (req.nextUrl.searchParams.get("date_from") ?? "").trim();
    const dateTo = (req.nextUrl.searchParams.get("date_to") ?? "").trim();
    const search = normalizeAuditSearchTerm((req.nextUrl.searchParams.get("search") ?? "").trim());
    const searchMode = normalizeAuditSearchMode((req.nextUrl.searchParams.get("search_mode") ?? "").trim());

    let rowsQuery = supabase.from("log_alteracoes").select("*", { count: "exact" }).order("data_hora", { ascending: false });

    if (tabela) rowsQuery = rowsQuery.eq("tabela", tabela);
    if (acao) rowsQuery = rowsQuery.eq("acao", acao);
    if (autor) rowsQuery = rowsQuery.eq("autor", autor);
    if (dateFrom) rowsQuery = rowsQuery.gte("data_hora", `${dateFrom}T00:00:00`);
    if (dateTo) rowsQuery = rowsQuery.lte("data_hora", endOfDayIso(dateTo));
    const [{ data: rows, error: rowsError, count }, { data: actionRows, error: actionsError }, { data: authorRows, error: authorsError }, { data: tableRows, error: tablesError }] =
      await Promise.all([
        search ? rowsQuery : rowsQuery.range(from, to),
        supabase
          .from("lookup_audit_actions")
          .select("code, name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase.from("log_alteracoes").select("autor").order("autor", { ascending: true }),
        supabase.from("log_alteracoes").select("tabela").order("tabela", { ascending: true })
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
    const normalizedSearch = normalizeSearchText(search);
    const filteredRows =
      normalizedSearch && rows
        ? rows.filter((row) =>
            matchesAuditSearch(
              buildAuditRowSearchText(row, actionLabelByCode[row.acao] ?? row.acao ?? ""),
              normalizedSearch,
              searchMode
            )
          )
        : (rows ?? []);
    const paginatedRows = normalizedSearch ? filteredRows.slice(from, to + 1) : filteredRows;
    const total = normalizedSearch ? filteredRows.length : (count ?? 0);

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
          totalPages: Math.max(1, Math.ceil(total / pageSize))
        },
        rows: paginatedRows.map((row) => ({
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
        }))
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
