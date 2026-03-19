import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

type RefreshResult = {
  grupos_repetidos: number;
  registros_repetidos: number;
};

export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { data, error } = await supabase.rpc("refresh_repetidos_projection" as never);

    if (error) {
      throw new ApiHttpError(500, "REBUILD_FAILED", "Falha ao atualizar projecao de repetidos.", error);
    }

    const { error: referenceError } = await supabase.rpc("refresh_anuncios_reference_projection" as never);

    if (referenceError) {
      throw new ApiHttpError(
        500,
        "ANUNCIOS_REFERENCE_REBUILD_FAILED",
        "Falha ao atualizar a referencia materializada de anuncios.",
        referenceError
      );
    }

    const result = (Array.isArray(data) ? data[0] : data) as
      | { grupos_repetidos?: number; registros_repetidos?: number }
      | null;
    const payload: RefreshResult = {
      grupos_repetidos: Number(result?.grupos_repetidos ?? 0),
      registros_repetidos: Number(result?.registros_repetidos ?? 0)
    };

    await writeAuditLog({
      action: "rebuild",
      table: "repetidos",
      actor,
      newData: {
        grupos: payload.grupos_repetidos,
        itens: payload.registros_repetidos
      },
      details: "Refresh da projecao SQL de repetidos"
    });

    return apiOk(payload, { request_id: requestId });
  });
}
