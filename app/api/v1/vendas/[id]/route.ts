import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { deleteVenda, updateVenda } from "@/lib/domain/vendas/service";
import { vendaUpdateSchema } from "@/lib/domain/vendas/schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;
    const { data, error } = await supabase
      .from("vendas")
      .select("*, carros(placa, nome, modelo_id, cor, ano_mod, ano_fab, preco_original)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", error);
    if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Venda nao encontrada.");

    return apiOk(data, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = vendaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de atualizacao invalido.", parsed.error);
    }

    const data = await updateVenda({
      supabase,
      actor,
      id,
      patch: parsed.data
    });

    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    await deleteVenda({ supabase, actor, id });
    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}
