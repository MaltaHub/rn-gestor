import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { contarEnvelopesAbertos } from "@/lib/domain/controle-envelopes/service";

// GET /api/v1/controle-envelopes/abertos -> { count } de retiradas em aberto (todos os veiculos).
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ supabase, requestId }) => {
    const count = await contarEnvelopesAbertos(supabase);
    return apiOk({ count }, { request_id: requestId });
  });
}
