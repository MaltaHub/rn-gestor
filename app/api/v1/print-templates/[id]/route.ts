import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { deletePrintTemplate, updatePrintTemplate } from "@/lib/domain/print-templates/service";
import { printTemplateUpdateSchema } from "@/lib/domain/print-templates/schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = printTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de atualizacao invalido.", parsed.error);
    }

    const data = await updatePrintTemplate({ supabase, actor, id, patch: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    await deletePrintTemplate({ supabase, actor, id });
    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
