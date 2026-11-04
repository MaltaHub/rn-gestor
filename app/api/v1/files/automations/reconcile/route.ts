import { NextRequest } from "next/server";
import { z } from "zod";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { ensureVehicleFileAutomations, reconcileVehicleFileAutomations } from "@/lib/domain/file-automations/service";

const bodySchema = z.object({ carroId: z.string().uuid().optional() });

/** POST { carroId? } — reaplica as regras de pastas num veículo (ou em todos, sem carroId). */
export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const raw = await req.text();
    let json: unknown = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      throw new ApiHttpError(400, "BAD_BODY", "JSON inválido.");
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) throw new ApiHttpError(400, "BAD_BODY", "Payload inválido.");
    const { carroId } = parsed.data;

    const result = carroId
      ? { processed: 1, temFotos: await ensureVehicleFileAutomations(supabase, carroId) }
      : await reconcileVehicleFileAutomations(supabase);

    await writeAuditLog({
      action: "rebuild",
      table: "arquivo_automacao_folders",
      pk: carroId ?? "file-automations",
      actor,
      newData: result,
      details: carroId ? "Reconciliacao das pastas do veiculo." : "Reconciliacao das pastas de automacao de arquivos."
    });

    return apiOk(result, { request_id: requestId });
  });
}
