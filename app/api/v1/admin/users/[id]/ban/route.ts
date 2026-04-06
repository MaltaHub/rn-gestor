import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const { data: user, error } = await supabase.from("usuarios_acesso").select("*").eq("id", id).maybeSingle();
    if (error) throw new ApiHttpError(400, "ACCESS_USER_READ_FAILED", "Falha ao carregar usuario.", error);
    if (!user) throw new ApiHttpError(404, "NOT_FOUND", "Usuario nao encontrado.");

    const { data: statusRow } = await supabase
      .from("lookup_user_statuses")
      .select("code")
      .ilike("code", "BANIDO")
      .maybeSingle();
    const bannedCode = statusRow?.code ?? "BANIDO";

    const { data: updated, error: updError } = await supabase
      .from("usuarios_acesso")
      .update({ status: bannedCode })
      .eq("id", id)
      .select("*")
      .single();
    if (updError) throw new ApiHttpError(400, "ACCESS_USER_BAN_FAILED", "Falha ao banir usuario.", updError);

    await writeAuditLog({
      action: "update",
      table: "usuarios_acesso",
      pk: id,
      actor,
      oldData: user,
      newData: updated,
      details: "Usuario banido."
    });

    return apiOk({ banned: true, id }, { request_id: requestId });
  });
}

