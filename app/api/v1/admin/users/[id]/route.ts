import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import { updateAdminAccessUser } from "@/lib/api/access-users";

type AccessUserPatchBody = {
  nome?: unknown;
  obs?: unknown;
  cargo?: unknown;
  status?: unknown;
};

function parsePatchBody(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload invalido para atualizacao de usuario.");
  }

  const input = raw as AccessUserPatchBody;
  const allowedKeys = new Set(["nome", "obs", "cargo", "status"]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD_FIELD", "Payload contem campo nao permitido.", { field: key });
    }
  }

  const updates: {
    nome?: string;
    obs?: string | null;
    cargo?: string;
    status?: string;
  } = {};

  if (input.nome !== undefined) {
    if (typeof input.nome !== "string") {
      throw new ApiHttpError(400, "INVALID_NAME", "O nome do usuario deve ser texto.");
    }
    updates.nome = input.nome;
  }

  if (input.obs !== undefined) {
    if (input.obs !== null && typeof input.obs !== "string") {
      throw new ApiHttpError(400, "INVALID_NOTES", "As observacoes do usuario devem ser texto.");
    }
    updates.obs = input.obs;
  }

  if (input.cargo !== undefined) {
    if (typeof input.cargo !== "string") {
      throw new ApiHttpError(400, "INVALID_ROLE", "O perfil do usuario deve ser texto.");
    }
    updates.cargo = input.cargo;
  }

  if (input.status !== undefined) {
    if (typeof input.status !== "string") {
      throw new ApiHttpError(400, "INVALID_STATUS", "O status do usuario deve ser texto.");
    }
    updates.status = input.status;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiHttpError(400, "EMPTY_UPDATE", "Informe ao menos um campo para atualizar.");
  }

  return updates;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const updates = parsePatchBody(await req.json());
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
