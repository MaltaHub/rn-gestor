import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { listGridTableInsightSummary } from "@/lib/api/grid-insights";
import { apiOk } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const byTable = await listGridTableInsightSummary({
      role: actor.role,
      supabase
    });

    return apiOk(
      {
        byTable
      },
      { request_id: requestId }
    );
  });
}
