import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  atualizarEnvelope,
  atualizarEnvelopeSchema,
  excluirEnvelope
} from "@/lib/domain/controle-envelopes/service";

// PATCH /api/v1/controle-envelopes/:id -> ADM edita a retirada (usuario, datas, status, item, observacao).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = atualizarEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "VALIDATION_FAILED", "Dados invalidos.", parsed.error.flatten());
    }
    const row = await atualizarEnvelope(supabase, actor, id, parsed.data);
    return apiOk({ row }, { request_id: requestId });
  });
}

// DELETE /api/v1/controle-envelopes/:id -> ADM apaga a retirada.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const row = await excluirEnvelope(supabase, actor, id);
    return apiOk({ row }, { request_id: requestId });
  });
}
