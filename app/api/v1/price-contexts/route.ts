import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  isAllowedPriceContextColumn,
  isAllowedPriceContextTable,
  listAllowedPriceContextTables,
  type PriceContextTableName
} from "@/lib/domain/price-contexts/policy";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "GERENTE");

    const table = (req.nextUrl.searchParams.get("table") ?? "").trim();
    const rowId = (req.nextUrl.searchParams.get("row_id") ?? "").trim();
    const column = (req.nextUrl.searchParams.get("column") ?? "").trim();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? 50)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let validatedTable: PriceContextTableName | null = null;
    if (table) {
      if (!isAllowedPriceContextTable(table)) {
        throw new ApiHttpError(
          400,
          "PRICE_CONTEXT_INVALID_TARGET",
          "Tabela nao permitida para contextos de preco.",
          { table, allowedTables: listAllowedPriceContextTables() }
        );
      }
      validatedTable = table;
    }

    if (column) {
      if (!validatedTable) {
        throw new ApiHttpError(
          400,
          "PRICE_CONTEXT_INVALID_TARGET",
          "Informe a tabela ao filtrar por coluna.",
          { column }
        );
      }
      if (!isAllowedPriceContextColumn(validatedTable, column)) {
        throw new ApiHttpError(
          400,
          "PRICE_CONTEXT_INVALID_TARGET",
          "Coluna nao permitida para contextos de preco.",
          { table: validatedTable, column }
        );
      }
    }

    let query = supabase
      .from("price_change_contexts")
      .select(
        "id, table_name, row_id, column_name, old_value, new_value, context, created_by, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (validatedTable) query = query.eq("table_name", validatedTable);
    if (rowId) query = query.eq("row_id", rowId);
    if (column) query = query.eq("column_name", column);

    const { data, error, count } = await query;
    if (error) throw new ApiHttpError(400, "PRICE_CONTEXT_LIST_FAILED", "Falha ao listar contextos de preco.", error);

    return apiOk(
      { rows: data ?? [] },
      {
        request_id: requestId,
        page,
        page_size: pageSize,
        total: count ?? 0
      }
    );
  });
}
