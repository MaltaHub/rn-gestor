import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { consultarPlacaTroca } from "@/lib/domain/vendedor/service";

// GET /api/v1/vendedor/placa?placa= — consulta da placa do veículo da troca
// (o vendedor cadastra a troca no fluxo de venda; /carros/consulta-placa é SECRETARIO+).
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");
    const data = await consultarPlacaTroca(supabase, req.nextUrl.searchParams.get("placa") ?? "");
    return apiOk(data, { request_id: requestId });
  });
}
