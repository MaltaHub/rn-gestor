import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { CARRO_CONFIRMACAO_ALVOS, type CarroConfirmacaoAlvo } from "@/lib/domain/compliance";

// Confirma um ALVO da tupla info_confirmada do veiculo:
//  - "campos": so funciona com todos os campos importantes (incl. modelo)
//    preenchidos — o trigger do banco bloqueia quando incompleto.
//  - "chave_manual": confirmacao direta de chave reserva + manual.
// RBAC = mesmo write de CARROS (SECRETARIO+).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ requestId, supabase }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { alvo?: unknown } | null;
    const alvo = body?.alvo;
    if (!CARRO_CONFIRMACAO_ALVOS.includes(alvo as CarroConfirmacaoAlvo)) {
      throw new ApiHttpError(400, "CARRO_CONFIRMAR_ALVO_INVALIDO", "Escolha o que confirmar: campos ou chave_manual.");
    }
    const { data, error } = await supabase.rpc("fn_carros_confirmar_info", {
      p_carro_id: id,
      p_alvo: alvo as CarroConfirmacaoAlvo
    });
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
