import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { apiOk } from "@/lib/api/response";
import { reconcileVehicleFileAutomations } from "@/lib/domain/file-automations/service";

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const result = await reconcileVehicleFileAutomations(supabase);

    await writeAuditLog({
      action: "rebuild",
      table: "arquivo_automacao_folders",
      pk: "file-automations",
      actor,
      newData: result,
      details: "Reconciliacao das pastas de automacao de arquivos."
    });

    return apiOk(result, { request_id: requestId });
  });
}
