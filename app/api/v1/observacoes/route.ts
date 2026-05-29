import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  criarObservacao,
  criarObservacaoSchema,
  listAtivasByCarro,
  listRecentesAtivas
} from "@/lib/domain/observacoes/service";

// GET /api/v1/observacoes?carro_id=...  -> post-its ativos do carro.
// Sem carro_id -> os 10 post-its ativos mais recentes (qualquer veiculo).
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ supabase, requestId }) => {
    const carroId = (req.nextUrl.searchParams.get("carro_id") ?? "").trim();
    const ativas = carroId
      ? await listAtivasByCarro(supabase, carroId)
      : await listRecentesAtivas(supabase, 10);
    return apiOk({ ativas }, { request_id: requestId });
  });
}

// POST /api/v1/observacoes -> cria um post-it
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, supabase, requestId }) => {
    const body = await req.json().catch(() => null);
    const parsed = criarObservacaoSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "VALIDATION_FAILED", "Dados invalidos.", parsed.error.flatten());
    }
    const row = await criarObservacao(supabase, actor, parsed.data);
    return apiOk({ row }, { request_id: requestId });
  });
}
