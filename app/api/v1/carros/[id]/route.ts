import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { CarroUpdate } from "@/lib/domain/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;

    const { data, error } = await supabase
      .from("carros")
      .select("*, modelos(modelo), anuncios(*)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", error);
    if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

    return apiOk(data, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const body = (await req.json()) as CarroUpdate & {
      atpv_e?: unknown;
      laudo?: unknown;
    };
    delete body.atpv_e;
    delete body.laudo;
    if (body.placa) {
      body.placa = body.placa.trim().toUpperCase();
    }

    const { data: oldData, error: oldError } = await supabase.from("carros").select("*").eq("id", id).maybeSingle();
    if (oldError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

    const { data, error } = await supabase.from("carros").update(body).eq("id", id).select("*").single();
    if (error) throw new ApiHttpError(400, "CARRO_UPDATE_FAILED", "Falha ao atualizar carro.", error);

    await writeAuditLog({
      action: "update",
      table: "carros",
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

    const { data: oldData, error: oldError } = await supabase.from("carros").select("*").eq("id", id).maybeSingle();
    if (oldError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

    const { error } = await supabase.from("carros").delete().eq("id", id);
    if (error) throw new ApiHttpError(400, "CARRO_DELETE_FAILED", "Falha ao remover carro.", error);

    await writeAuditLog({
      action: "delete",
      table: "carros",
      pk: id,
      actor,
      oldData
    });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
