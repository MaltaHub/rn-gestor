import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";

// Confirma as informacoes do veiculo (info_confirmada=true). So funciona se todos
// os campos importantes (incl. modelo) estiverem preenchidos — o trigger do banco
// bloqueia quando incompleto. RBAC = mesmo write de CARROS (SECRETARIO+).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ requestId, supabase }) => {
    const { id } = await params;
    const { data, error } = await supabase.rpc("fn_carros_confirmar_info", { p_carro_id: id });
    if (error) {
      if (error.code === "23514") {
        throw new ApiHttpError(
          409,
          "CARRO_INFO_INCOMPLETA",
          "Preencha todos os campos importantes (incl. modelo) antes de confirmar.",
          error
        );
      }
      throw new ApiHttpError(400, "CARRO_CONFIRMAR_FAILED", "Falha ao confirmar as informações do veículo.", error);
    }
    return apiOk(data, { request_id: requestId });
  });
}
