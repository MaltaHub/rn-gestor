import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import {
  deleteDocumentoTemplate,
  getDocumentoTemplate,
  updateDocumentoTemplate
} from "@/lib/domain/documento-templates/service";
import { documentoTemplateUpdateSchema } from "@/lib/domain/documento-templates/schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;
    const data = await getDocumentoTemplate(supabase, id);
    return apiOk(data, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = documentoTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de atualizacao invalido.", parsed.error);
    }
    const data = await updateDocumentoTemplate({ supabase, actor, id, patch: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    await deleteDocumentoTemplate({ supabase, actor, id });
    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
