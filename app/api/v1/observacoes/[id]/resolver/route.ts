import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { resolverObservacao, resolverObservacaoSchema } from "@/lib/domain/observacoes/service";

// POST /api/v1/observacoes/:id/resolver -> marca como resolvido (SECRETARIO+).
// Body opcional: { feedback_solucao?: string } registra a solucao junto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, supabase, requestId }) => {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = resolverObservacaoSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new ApiHttpError(400, "VALIDATION_FAILED", "Dados invalidos.", parsed.error.flatten());
    }
    const row = await resolverObservacao(supabase, actor, id, parsed.data);
    return apiOk({ row }, { request_id: requestId });
  });
}
