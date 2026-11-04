import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { ocrTemplateInputSchema } from "@/lib/domain/ocr/schemas";
import { deleteOcrTemplate, getOcrTemplate, updateOcrTemplate } from "@/lib/domain/ocr/service";

type Params = { params: Promise<{ id: string }> };

/** GET: template completo (inclui o OCR do exemplo para o console). */
export async function GET(req: NextRequest, { params }: Params) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;
    return apiOk({ template: await getOcrTemplate(supabase, id) }, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await parseJsonBody(req, ocrTemplateInputSchema);
    return apiOk({ template: await updateOcrTemplate(supabase, actor, id, body) }, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    return apiOk(await deleteOcrTemplate(supabase, actor, id), { request_id: requestId });
  });
}
