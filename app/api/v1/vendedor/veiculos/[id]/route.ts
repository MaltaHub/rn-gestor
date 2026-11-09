import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getPainelVeiculo } from "@/lib/domain/vendedor/service";

// GET /api/v1/vendedor/veiculos/:id -> painel da venda (carro, venda ativa,
// documentos Word e arquivos da pasta) numa ida só.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");
    const { id } = await params;
    const data = await getPainelVeiculo(supabase, id);
    return apiOk(data, { request_id: requestId });
  });
}
