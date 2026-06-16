import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import { updateOwnAccessProfile } from "@/lib/api/access-users";

const AVATAR_BUCKET = "avatares";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extFromType(type: string): string {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : "jpg";
}

/**
 * POST /api/v1/me/avatar (multipart, campo `file`) -> sobe a foto para o bucket
 * PUBLICO `avatares`, grava a URL publica em usuarios_acesso.foto e a retorna.
 * A foto aparece em paginas publicas (catalogo/galeria), por isso bucket publico.
 */
export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    if (!actor.userId) throw new ApiHttpError(404, "ACCESS_USER_NOT_FOUND", "Perfil nao encontrado.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiHttpError(400, "AVATAR_FILE_MISSING", "Envie um arquivo de imagem.");
    if (!ALLOWED.has(file.type)) throw new ApiHttpError(400, "AVATAR_TYPE_INVALID", "Formato inválido (use JPG, PNG, WEBP ou GIF).");
    if (file.size > MAX_BYTES) throw new ApiHttpError(400, "AVATAR_TOO_LARGE", "Imagem muito grande (máx. 5MB).");

    // Caminho estavel por usuario (sobrescreve a anterior, sem acumular lixo).
    const path = `${actor.userId}/avatar.${extFromType(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, buffer, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true
    });
    if (uploadError) throw new ApiHttpError(400, "AVATAR_UPLOAD_FAILED", "Falha ao enviar a foto.", uploadError);

    // URL publica + cache-buster (o caminho e fixo; troca de foto precisa furar cache).
    const base = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    const foto = `${base}?v=${Date.now()}`;

    const profile = await updateOwnAccessProfile({ supabase, userId: actor.userId, updates: { foto } });

    await writeAuditLog({
      action: "update",
      table: "usuarios_acesso",
      pk: actor.userId,
      actor,
      newData: { foto },
      details: "Upload de foto de perfil."
    });

    return apiOk(profile, { request_id: requestId });
  });
}
