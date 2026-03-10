import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId }) => {
    return apiOk(actor, { request_id: requestId });
  });
}
