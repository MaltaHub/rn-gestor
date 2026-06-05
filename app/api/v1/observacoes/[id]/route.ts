import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  atualizarObservacao,
  atualizarObservacaoSchema,
  excluirObservacao
} from "@/lib/domain/observacoes/service";

// PATCH /api/v1/observacoes/:id -> edita titulo/tipo/texto/prazo/feedback (VENDEDOR+).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = atualizarObservacaoSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "VALIDATION_FAILED", "Dados invalidos.", parsed.error.flatten());
    }
    const row = await atualizarObservacao(supabase, actor, id, parsed.data);
    return apiOk({ row }, { request_id: requestId });
  });
}

// DELETE /api/v1/observacoes/:id -> ADM apaga o post-it.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const row = await excluirObservacao(supabase, actor, id);
    return apiOk({ row }, { request_id: requestId });
  });
}
