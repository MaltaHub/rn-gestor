import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { ocrTemplateInputSchema } from "@/lib/domain/ocr/schemas";
import { createOcrTemplate, listOcrTemplates } from "@/lib/domain/ocr/service";

/** GET: templates (sem o OCR do exemplo) — upload e console. Configuração de OCR é só do ADMINISTRADOR. */
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    return apiOk({ templates: await listOcrTemplates(supabase) }, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const body = await parseJsonBody(req, ocrTemplateInputSchema);
    return apiOk({ template: await createOcrTemplate(supabase, actor, body) }, { request_id: requestId });
  });
}
