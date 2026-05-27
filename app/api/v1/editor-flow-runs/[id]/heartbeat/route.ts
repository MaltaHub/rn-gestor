import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { heartbeatFlowRun } from "@/lib/domain/editor-flow-runs/service";
import { flowRunHeartbeatSchema } from "@/lib/domain/editor-flow-runs/schemas";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = flowRunHeartbeatSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de heartbeat invalido.", parsed.error);
    }

    const data = await heartbeatFlowRun({ supabase, actor, id, patch: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}
