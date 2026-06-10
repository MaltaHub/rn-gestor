import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { buildVendaDocContext } from "@/lib/domain/venda-documentos/service";

// Contexto de variaveis ${...} de um processo (para preview/print no editor).
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const vendaId = req.nextUrl.searchParams.get("venda_id");
    if (!vendaId) {
      throw new ApiHttpError(400, "MISSING_VENDA_ID", "Informe venda_id.");
    }
    const contexto = await buildVendaDocContext({ supabase, vendaId });
    return apiOk(contexto, { request_id: requestId });
  });
}
