import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/request";
import { listAuditoria } from "@/lib/domain/auditoria/service";

export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    const { page, pageSize } = parsePagination(req);

    const result = await listAuditoria({
      supabase,
      page,
      pageSize,
      tabela: req.nextUrl.searchParams.get("tabela"),
      acao: req.nextUrl.searchParams.get("acao")
    });

    return apiOk(result.rows, {
      request_id: requestId,
      page,
      page_size: pageSize,
      total: result.total
    });
  });
}
