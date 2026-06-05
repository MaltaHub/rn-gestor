import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listEnvelopesRecentes } from "@/lib/domain/controle-envelopes/service";

// GET /api/v1/controle-envelopes/recentes -> { recentes } ultimas interacoes (todos os veiculos).
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ supabase, requestId }) => {
    const recentes = await listEnvelopesRecentes(supabase);
    return apiOk({ recentes }, { request_id: requestId });
  });
}
