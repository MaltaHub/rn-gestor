import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { listMissingAnuncioGridRows } from "@/lib/api/grid-insights";
import { apiOk } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");

    const rows = await listMissingAnuncioGridRows(supabase);

    return apiOk(
      {
        rows
      },
      { request_id: requestId }
    );
  });
}
