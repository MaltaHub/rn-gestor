import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/request";
import { listProcessos } from "@/lib/domain/venda-documentos/service";

// Navegacao do editor: TODAS as placas (carros), ordenadas por estágio, 50/pág,
// buscáveis por placa/modelo/nome.
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize } = parsePagination(req);
    const result = await listProcessos({
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
