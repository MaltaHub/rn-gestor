import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listFileInconsistencies } from "@/lib/domain/file-automations/service";

/** GET /files/inconsistencies — veiculos x pastas fora das regras (sem pasta, pausada, fora do lugar...). */
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    return apiOk({ issues: await listFileInconsistencies(supabase) }, { request_id: requestId });
  });
}
