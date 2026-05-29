import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listFlowRuns, startFlowRun } from "@/lib/domain/editor-flow-runs/service";
import { flowRunStartSchema } from "@/lib/domain/editor-flow-runs/schemas";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const flowId = req.nextUrl.searchParams.get("flow_id");
    const statusesRaw = req.nextUrl.searchParams.getAll("status");
    const rows = await listFlowRuns({ supabase, actor, flowId, statuses: statusesRaw });
    return apiOk(rows, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = flowRunStartSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de start invalido.", parsed.error);
    }

    const data = await startFlowRun({ supabase, actor, flowId: parsed.data.flow_id });
    return apiOk(data, { request_id: requestId });
  });
}
