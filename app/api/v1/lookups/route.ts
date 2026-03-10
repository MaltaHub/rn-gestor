import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { fetchLookupsForActor } from "@/lib/api/lookups";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const lookups = await fetchLookupsForActor({ actor, supabase });
    return apiOk(lookups, { request_id: requestId });
  });
}
