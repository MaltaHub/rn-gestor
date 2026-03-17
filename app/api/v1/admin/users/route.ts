import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { listAdminAccessLookups, listAdminAccessUsers } from "@/lib/api/access-users";

export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    const [users, lookups] = await Promise.all([listAdminAccessUsers(supabase), listAdminAccessLookups(supabase)]);

    return apiOk(
      {
        users,
        lookups
      },
      { request_id: requestId }
    );
  });
}
