import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const table = (req.nextUrl.searchParams.get("table") ?? "").trim();
    const rowId = (req.nextUrl.searchParams.get("row_id") ?? "").trim();
    const column = (req.nextUrl.searchParams.get("column") ?? "").trim();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? 50)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = supabase;
    let query = client
      .from("price_change_contexts")
      .select("id, table_name, row_id, column_name, old_value, new_value, context, created_by, created_at", {
        count: "exact"
      })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (table) query = query.eq("table_name", table);
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

