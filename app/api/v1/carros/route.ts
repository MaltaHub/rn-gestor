import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/request";
import type { CarroInsert } from "@/lib/domain/db";
import { createCarro, listCarros } from "@/lib/domain/carros/service";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize } = parsePagination(req);

    const result = await listCarros({
      supabase,
      page,
      pageSize,
      q: req.nextUrl.searchParams.get("q"),
      local: req.nextUrl.searchParams.get("local"),
      estadoVenda: req.nextUrl.searchParams.get("estado_venda")
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
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const body = (await req.json()) as Partial<CarroInsert>;

    const data = await createCarro({
      supabase,
      actor,
      row: body
    });

    return apiOk(data, { request_id: requestId });
  });
}
