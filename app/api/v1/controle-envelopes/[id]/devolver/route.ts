import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { registrarDevolucao } from "@/lib/domain/controle-envelopes/service";

// POST /api/v1/controle-envelopes/:id/devolver -> fecha a retirada
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const row = await registrarDevolucao(supabase, actor, id);
    return apiOk({ row }, { request_id: requestId });
  });
}
