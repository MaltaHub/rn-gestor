import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { deleteEditorFlow, getEditorFlow, updateEditorFlow } from "@/lib/domain/editor-flows/service";
import { editorFlowUpdateSchema } from "@/lib/domain/editor-flows/schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const data = await getEditorFlow({ supabase, actor, id });
    return apiOk(data, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = editorFlowUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de atualizacao invalido.", parsed.error);
    }

    const data = await updateEditorFlow({ supabase, actor, id, patch: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    await deleteEditorFlow({ supabase, actor, id });
    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
