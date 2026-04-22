import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/request";
import type { ModeloInsert } from "@/lib/domain/db";
import { createModelo, listModelos } from "@/lib/domain/modelos/service";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize } = parsePagination(req);

    const result = await listModelos({
      supabase,
      page,
      pageSize,
      q: req.nextUrl.searchParams.get("q")
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
    const body = (await req.json()) as Partial<ModeloInsert>;
    const data = await createModelo({ supabase, actor, row: body });
    return apiOk(data, { request_id: requestId });
  });
}
