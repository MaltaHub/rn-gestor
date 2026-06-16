import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validation";
import { writeAuditLog } from "@/lib/api/audit";
import { getOwnAccessProfile, updateOwnAccessProfile } from "@/lib/api/access-users";
import { mePerfilUpdateSchema } from "@/lib/domain/perfil/schemas";

// GET /api/v1/me/perfil -> perfil próprio (foto/bio/telefone/nome/email).
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    if (!actor.userId) throw new ApiHttpError(404, "ACCESS_USER_NOT_FOUND", "Perfil nao encontrado.");
    const profile = await getOwnAccessProfile(supabase, actor.userId);
    return apiOk(profile, { request_id: requestId });
  });
}

// PATCH /api/v1/me/perfil -> atualiza o PRÓPRIO foto/bio/telefone.
export async function PATCH(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    if (!actor.userId) throw new ApiHttpError(404, "ACCESS_USER_NOT_FOUND", "Perfil nao encontrado.");
    const updates = await parseJsonBody(req, mePerfilUpdateSchema);
    const profile = await updateOwnAccessProfile({ supabase, userId: actor.userId, updates });

    await writeAuditLog({
      action: "update",
      table: "usuarios_acesso",
      pk: actor.userId,
      actor,
      newData: profile,
      details: "Auto-servico de perfil (foto/bio/telefone)."
    });

    return apiOk(profile, { request_id: requestId });
  });
}
