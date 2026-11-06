import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

import { ApiHttpError } from "@/lib/api/errors";
import { apiError, apiOk } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { executarFinalizacao } from "@/lib/domain/finalizacao/service";

export const maxDuration = 60;

/**
 * POST /api/v1/internal/finalizacao — disparado pelo pg_cron (fn_disparar_finalizacao)
 * com o token interno no header `x-cron-token`. Sem sessão de usuário: o token é
 * conferido no banco (fn_cron_token_valido). Desligada = só devolve o relatório.
 */
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const supabase = getSupabaseAdmin();
    const token = req.headers.get("x-cron-token") ?? "";
    const { data: valido, error: tokenError } = await supabase.rpc("fn_cron_token_valido", { p_token: token });
    if (tokenError) throw new ApiHttpError(500, "CRON_TOKEN_CHECK_FAILED", "Falha ao validar o token.", tokenError);
    if (valido !== true) return apiError(requestId, 401, "UNAUTHORIZED", "Token inválido.");

    const { data: ativa, error: ativaError } = await supabase.rpc("fn_finalizacao_ativa");
    if (ativaError) throw new ApiHttpError(500, "FINALIZACAO_CONFIG_FAILED", "Falha ao ler a configuração.", ativaError);

    const resultado = await executarFinalizacao(supabase, { ativa: ativa === true });
    if (resultado.finalizados.length > 0 || resultado.falhas.length > 0) {
      console.info("[FINALIZACAO]", { requestId, finalizados: resultado.finalizados, falhas: resultado.falhas });
    }
    return apiOk(
      {
        ativa: resultado.ativa,
        elegiveis: resultado.elegiveis.length,
        semDataVenda: resultado.semDataVenda.length,
        finalizados: resultado.finalizados,
        falhas: resultado.falhas,
        documentosExpirados: resultado.documentosExpirados,
        proximos: resultado.elegiveis.slice(0, 20).map((carro) => `${carro.placa} (${carro.dias} dias)`)
      },
      { request_id: requestId }
    );
  } catch (error) {
    const status = error instanceof ApiHttpError ? error.status : 500;
    const code = error instanceof ApiHttpError ? error.code : "FINALIZACAO_ERROR";
    console.error("[FINALIZACAO_ERROR]", { requestId, error });
    return apiError(requestId, status, code, error instanceof Error ? error.message : "Falha na finalização.");
  }
}
