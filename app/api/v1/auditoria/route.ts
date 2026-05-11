import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseListPagination } from "@/lib/api/request";
import { listAuditoria } from "@/lib/domain/auditoria/service";

export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    const { page, pageSize } = parseListPagination(req, { defaultPageSize: 50, maxPageSize: 200 });

    const result = await listAuditoria({
      supabase,
      page,
      pageSize,
      tabela: req.nextUrl.searchParams.get("tabela"),
      acao: req.nextUrl.searchParams.get("acao")
    });

    const total = result.total;
    const hasMore = page * pageSize < total;

    return apiOk(
      {
        items: result.rows,
        total,
        page,
        pageSize,
        hasMore
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
