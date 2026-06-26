import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";

// "Disponibilizar" um carro RESERVADO: apaga a venda em aberto e devolve o carro
// ao estoque. Operacao sensivel (apaga a reserva) -> restrita a GERENTE+.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ requestId, supabase }) => {
    const { id } = await params;
    const { error } = await supabase.rpc("fn_carros_disponibilizar", { p_carro_id: id });
    if (error) {
      if (error.code === "23514") {
        throw new ApiHttpError(409, "CARRO_NAO_RESERVADO", "Este veículo não está reservado.", error);
      }
      throw new ApiHttpError(400, "CARRO_DISPONIBILIZAR_FAILED", "Falha ao disponibilizar o veículo.", error);
    }
    return apiOk({ disponibilizado: true, id }, { request_id: requestId });
  });
}
