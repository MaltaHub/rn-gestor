import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getFlowRun, patchFlowRun } from "@/lib/domain/editor-flow-runs/service";
import { flowRunPatchSchema } from "@/lib/domain/editor-flow-runs/schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const data = await getFlowRun({ supabase, actor, id });
    return apiOk(data, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = flowRunPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de patch invalido.", parsed.error);
    }

    const data = await patchFlowRun({ supabase, actor, id, patch: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}
