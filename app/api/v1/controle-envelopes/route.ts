import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import {
  listEnvelopesByCarro,
  registrarRetirada,
  registrarRetiradaSchema
} from "@/lib/domain/controle-envelopes/service";

// GET /api/v1/controle-envelopes?carro_id=...[&include_closed=1]
// Por padrao traz so as retiradas abertas. include_closed=1 traz tambem as fechadas
// (usado pela visao de historico do ADM).
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ supabase, requestId }) => {
    const carroId = (req.nextUrl.searchParams.get("carro_id") ?? "").trim();
    if (!carroId) {
      throw new ApiHttpError(400, "MISSING_CARRO_ID", "Informe carro_id.");
    }
    const includeClosed = ["1", "true", "yes"].includes(
      (req.nextUrl.searchParams.get("include_closed") ?? "").toLowerCase()
    );
    const rows = await listEnvelopesByCarro(supabase, carroId, { includeClosed });
    const abertos = rows.filter((row) => row.status === "com_usuario");
    return apiOk({ abertos, rows, include_closed: includeClosed }, { request_id: requestId });
  });
}

// POST /api/v1/controle-envelopes -> registra retirada (overrides ADM no body).
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "VENDEDOR", async ({ actor, supabase, requestId }) => {
    const body = await req.json().catch(() => null);
    const parsed = registrarRetiradaSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "VALIDATION_FAILED", "Dados invalidos.", parsed.error.flatten());
    }
    const row = await registrarRetirada(supabase, actor, parsed.data);
    return apiOk({ row }, { request_id: requestId });
  });
}
