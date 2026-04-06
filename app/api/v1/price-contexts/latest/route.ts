import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const table = (req.nextUrl.searchParams.get("table") ?? "").trim();
    const rowId = (req.nextUrl.searchParams.get("row_id") ?? "").trim();
    const column = (req.nextUrl.searchParams.get("column") ?? "").trim();

    if (!table || !rowId || !column) {
      throw new ApiHttpError(400, "MISSING_PARAMS", "Informe table, row_id e column.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = supabase;
    const { data, error } = await client
      .from("price_change_contexts")
      .select("id, table_name, row_id, column_name, old_value, new_value, context, created_by, created_at")
      .eq("table_name", table)
      .eq("row_id", rowId)
      .eq("column_name", column)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new ApiHttpError(400, "PRICE_CONTEXT_READ_FAILED", "Falha ao carregar contexto de preco.", error);

    return apiOk({ entry: data ?? null }, { request_id: requestId });
  });
}

