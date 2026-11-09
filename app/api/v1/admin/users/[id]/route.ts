import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { describeAudit } from "@/lib/api/audit-context";
import { parseJsonBody } from "@/lib/api/validation";
import { adminUserUpdateSchema } from "@/lib/domain/admin/schemas";
import { updateAdminAccessUser } from "@/lib/api/access-users";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const updates = await parseJsonBody(req, adminUserUpdateSchema);
    describeAudit("Atualização administrativa de usuário.");
    const user = await updateAdminAccessUser({
      supabase,
      userId: id,
      actorId: actor.userId,
      updates
    });

    return apiOk({ user }, { request_id: requestId });
  });
}
