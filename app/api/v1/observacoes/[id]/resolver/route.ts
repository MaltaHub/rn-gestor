import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { resolverObservacao } from "@/lib/domain/observacoes/service";

// POST /api/v1/observacoes/:id/resolver -> marca como resolvido (SECRETARIO+)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const row = await resolverObservacao(supabase, actor, id);
    return apiOk({ row }, { request_id: requestId });
  });
}
