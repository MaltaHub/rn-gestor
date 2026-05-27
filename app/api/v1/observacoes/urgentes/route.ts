import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { contarUrgentesAtivas } from "@/lib/domain/observacoes/service";

// GET /api/v1/observacoes/urgentes -> { count } de post-its urgentes ativos
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ supabase, requestId }) => {
    const count = await contarUrgentesAtivas(supabase);
    return apiOk({ count }, { request_id: requestId });
  });
}
