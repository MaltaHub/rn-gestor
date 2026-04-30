import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listGridFacets } from "@/lib/api/grid/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { table } = await params;
    const payload = await listGridFacets({ req, table, actor, supabase });
    return apiOk(payload, { request_id: requestId });
  });
}

