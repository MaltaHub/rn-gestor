import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  listAllowedPriceContextTables,
  validatePriceContextTarget
} from "@/lib/domain/price-contexts/policy";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "GERENTE");

    const table = (req.nextUrl.searchParams.get("table") ?? "").trim();
    const rowId = (req.nextUrl.searchParams.get("row_id") ?? "").trim();
    const column = (req.nextUrl.searchParams.get("column") ?? "").trim();

    if (!table || !rowId || !column) {
      throw new ApiHttpError(400, "MISSING_PARAMS", "Informe table, row_id e column.");
    }

    const validation = validatePriceContextTarget({ table, column });
    if (!validation.ok) {
      throw new ApiHttpError(
        400,
        "PRICE_CONTEXT_INVALID_TARGET",
        validation.error.kind === "TABLE_NOT_ALLOWED"
          ? "Tabela nao permitida para contextos de preco."
          : "Coluna nao permitida para contextos de preco.",
        {
          ...validation.error,
          allowedTables: listAllowedPriceContextTables()
        }
      );
    }

    const { data, error } = await supabase
      .from("price_change_contexts")
      .select(
        "id, table_name, row_id, column_name, old_value, new_value, context, created_by, created_at"
      )
      .eq("table_name", validation.target.table)
      .eq("row_id", rowId)
      .eq("column_name", validation.target.column)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new ApiHttpError(400, "PRICE_CONTEXT_READ_FAILED", "Falha ao carregar contexto de preco.", error);

    return apiOk({ entry: data ?? null }, { request_id: requestId });
  });
}
