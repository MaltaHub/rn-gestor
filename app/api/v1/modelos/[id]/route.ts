import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const body = (await req.json()) as { modelo?: string };
    if (!body.modelo || !body.modelo.trim()) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campo 'modelo' e obrigatorio.");
    }

    const { data: oldData, error: oldError } = await supabase.from("modelos").select("*").eq("id", id).maybeSingle();
    if (oldError) throw new ApiHttpError(400, "MODELO_READ_FAILED", "Falha ao ler modelo.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Modelo nao encontrado.");

    const { data, error } = await supabase
      .from("modelos")
      .update({ modelo: body.modelo.trim() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new ApiHttpError(400, "MODELO_UPDATE_FAILED", "Falha ao atualizar modelo.", error);

    await writeAuditLog({
      action: "update",
      table: "modelos",
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

    const { data: oldData, error: oldError } = await supabase.from("modelos").select("*").eq("id", id).maybeSingle();
    if (oldError) throw new ApiHttpError(400, "MODELO_READ_FAILED", "Falha ao ler modelo.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Modelo nao encontrado.");

    const { error } = await supabase.from("modelos").delete().eq("id", id);
    if (error) throw new ApiHttpError(400, "MODELO_DELETE_FAILED", "Falha ao remover modelo.", error);

    await writeAuditLog({
      action: "delete",
      table: "modelos",
      pk: id,
      actor,
      oldData
    });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
