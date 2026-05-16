import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/request";
import { createVenda, listVendas } from "@/lib/domain/vendas/service";
import { vendaCreateSchema } from "@/lib/domain/vendas/schemas";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize } = parsePagination(req);

    const result = await listVendas({
      supabase,
      page,
      pageSize,
      estadoVenda: req.nextUrl.searchParams.get("estado_venda"),
      vendedorAuthUserId: req.nextUrl.searchParams.get("vendedor_auth_user_id")
    });

    return apiOk(result.rows, {
      request_id: requestId,
      page,
      page_size: pageSize,
      total: result.total
    });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = vendaCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de venda invalido.", parsed.error);
    }

    const data = await createVenda({
      supabase,
      actor,
      row: parsed.data
    });

    return apiOk(data, { request_id: requestId });
  });
}
