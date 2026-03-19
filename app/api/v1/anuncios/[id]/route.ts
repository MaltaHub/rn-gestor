import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const body = (await req.json()) as {
      anuncio_legado?: boolean;
      descricao?: string | null;
      estado_anuncio?: string;
      id_anuncio_legado?: string | null;
      valor_anuncio?: number | null;
    };

    const { data: oldData, error: oldError } = await supabase.from("anuncios").select("*").eq("id", id).maybeSingle();
    if (oldError) throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anuncio.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Anuncio nao encontrado.");

    const { data, error } = await supabase.from("anuncios").update(body).eq("id", id).select("*").single();
    if (error) throw new ApiHttpError(400, "ANUNCIO_UPDATE_FAILED", "Falha ao atualizar anuncio.", error);

    await writeAuditLog({
      action: "update",
      table: "anuncios",
      pk: id,
      actor,
      oldData,
      newData: data
    });

    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const { data: oldData, error: oldError } = await supabase.from("anuncios").select("*").eq("id", id).maybeSingle();
    if (oldError) throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anuncio.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Anuncio nao encontrado.");

    const { error } = await supabase.from("anuncios").delete().eq("id", id);
    if (error) throw new ApiHttpError(400, "ANUNCIO_DELETE_FAILED", "Falha ao remover anuncio.", error);

    await writeAuditLog({
      action: "delete",
      table: "anuncios",
      pk: id,
      actor,
      oldData
    });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
