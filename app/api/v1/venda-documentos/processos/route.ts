import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listProcessos } from "@/lib/domain/venda-documentos/service";

// Navegacao do editor: veiculos (por placa) com venda concluida ou documentos.
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const rows = await listProcessos(supabase);
    return apiOk(rows, { request_id: requestId });
  });
}
