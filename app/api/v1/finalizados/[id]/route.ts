import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const { data: carro, error: carroError } = await supabase
      .from("carros")
      .select("*, modelos(modelo)")
      .eq("id", id)
      .maybeSingle();

    if (carroError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", carroError);
    if (!carro) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

    const modeloNome = (carro.modelos as { modelo?: string } | null)?.modelo ?? "-";

    const finalizadoPayload = {
      id: carro.id,
      modelo: modeloNome,
      placa: carro.placa,
      cor: carro.cor,
      chassi: carro.chassi,
      renavam: carro.renavam,
      ano_fab: carro.ano_fab,
      ano_mod: carro.ano_mod,
      ano_ipva_pago: carro.ano_ipva_pago,
      hodometro: carro.hodometro,
      data_venda: new Date().toISOString()
    };

    const { data: finalizado, error: finalizadoError } = await supabase
      .from("finalizados")
      .upsert(finalizadoPayload, { onConflict: "id" })
      .select("*")
      .single();

    if (finalizadoError) {
      throw new ApiHttpError(400, "FINALIZAR_FAILED", "Falha ao mover carro para finalizados.", finalizadoError);
    }

    const { data: saleStatuses } = await supabase
      .from("lookup_sale_statuses")
      .select("code, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const soldStatus =
      saleStatuses?.find((row) => row.name.toLowerCase().includes("vend"))?.code ??
      saleStatuses?.find((row) => row.code.toLowerCase().includes("vend"))?.code ??
      carro.estado_venda;

    const { data: updatedCar, error: updateError } = await supabase
      .from("carros")
      .update({
        em_estoque: false,
        data_venda: new Date().toISOString(),
        estado_venda: soldStatus
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) throw new ApiHttpError(400, "CARRO_UPDATE_FAILED", "Falha ao atualizar status do carro.", updateError);

    await writeAuditLog({
      action: "finalize",
      table: "carros",
      pk: id,
      actor,
      oldData: carro,
      newData: updatedCar,
      details: "Carro movido para finalizados"
    });

    return apiOk({ finalizado, carro: updatedCar }, { request_id: requestId });
  });
}
