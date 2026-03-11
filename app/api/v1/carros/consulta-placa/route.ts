import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { callConsultaPlaca } from "@/lib/domain/carros-enrichment";

export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ requestId }) => {
    const placa = req.nextUrl.searchParams.get("placa")?.trim().toUpperCase();

    if (!placa) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", 'Parametro "placa" e obrigatorio.');
    }

    const lookup = await callConsultaPlaca(placa);
    if (!lookup.data) {
      throw new ApiHttpError(502, "CARRO_PLATE_LOOKUP_FAILED", lookup.error ?? "Falha ao consultar a placa.");
    }

    return apiOk(lookup.data, { request_id: requestId });
  });
}
