import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  registrarDevolucao,
  registrarDevolucaoSchema
} from "@/lib/domain/controle-envelopes/service";

// POST /api/v1/controle-envelopes/:id/devolver -> fecha a retirada.
// Body (opcional, ADM): { usuario_auth_user_id?: uuid | null, devolvido_em?: iso8601 }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = registrarDevolucaoSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new ApiHttpError(400, "VALIDATION_FAILED", "Dados invalidos.", parsed.error.flatten());
    }
    const row = await registrarDevolucao(supabase, actor, id, parsed.data);
    return apiOk({ row }, { request_id: requestId });
  });
}
