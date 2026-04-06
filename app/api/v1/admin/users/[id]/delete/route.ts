import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const { data: user, error } = await supabase.from("usuarios_acesso").select("*").eq("id", id).maybeSingle();
    if (error) throw new ApiHttpError(400, "ACCESS_USER_READ_FAILED", "Falha ao carregar usuario.", error);
    if (!user) throw new ApiHttpError(404, "NOT_FOUND", "Usuario nao encontrado.");

    const authUserId = String((user as Record<string, unknown>)["auth_user_id"] ?? "") || null;
    if (authUserId) {
      const { error: delAuthError } = await supabase.auth.admin.deleteUser(authUserId);
      if (delAuthError) throw new ApiHttpError(400, "AUTH_USER_DELETE_FAILED", "Falha ao excluir conta auth.", delAuthError);
    }

    const { error: delError } = await supabase.from("usuarios_acesso").delete().eq("id", id);
    if (delError) throw new ApiHttpError(400, "ACCESS_USER_DELETE_FAILED", "Falha ao remover perfil de acesso.", delError);

    await writeAuditLog({
      action: "delete",
      table: "usuarios_acesso",
      pk: id,
      actor,
      oldData: user,
      details: "Exclusao administrativa de usuario."
    });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
