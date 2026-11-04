import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { ocrApplySchema } from "@/lib/domain/ocr/schemas";
import { applyOcrValues } from "@/lib/domain/ocr/service";

/**
 * POST /files/ocr/apply { carroId, templateId, values: { destino: valor }, markReady }
 * Grava no veiculo os valores extraidos e CONFIRMADOS. Destinos so da allow-list
 * (lib/domain/ocr/destinations.ts). Mesmo nivel do fluxo de CRLV (SECRETARIO+).
 */
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const body = await parseJsonBody(req, ocrApplySchema);
    return apiOk(await applyOcrValues(supabase, actor, body), { request_id: requestId });
  });
}
