import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { cancelVenda } from "@/lib/domain/vendas/service";

// Cancelar a venda devolve o carro ao estoque (e reverte o envelope). Operacao
// sensivel (reverte uma venda) -> restrita a GERENTE+.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const data = await cancelVenda({ supabase, actor, id });
    return apiOk(data, { request_id: requestId });
  });
}
