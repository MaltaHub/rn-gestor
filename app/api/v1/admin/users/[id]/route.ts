import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/api/audit";
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
    const user = await updateAdminAccessUser({
      supabase,
      userId: id,
      updates
    });

    await writeAuditLog({
      action: "update",
      table: "usuarios_acesso",
      pk: user.id,
      actor,
      newData: user,
      details: "Atualizacao administrativa de usuario de acesso."
    });

    return apiOk({ user }, { request_id: requestId });
  });
}
