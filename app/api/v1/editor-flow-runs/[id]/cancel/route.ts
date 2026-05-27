import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { cancelFlowRun } from "@/lib/domain/editor-flow-runs/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const data = await cancelFlowRun({ supabase, actor, id });
    return apiOk(data, { request_id: requestId });
  });
}
