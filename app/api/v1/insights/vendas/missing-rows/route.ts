import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { listMissingVendaGridRows } from "@/lib/api/vendas-insights";
import { apiOk } from "@/lib/api/response";

/** GET /insights/vendas/missing-rows — vendidos sem data e sem venda registrada (linhas virtuais do grid). */
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");
    const rows = await listMissingVendaGridRows(supabase);
    return apiOk({ rows }, { request_id: requestId });
  });
}
