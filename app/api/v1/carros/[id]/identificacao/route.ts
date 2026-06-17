import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import { formatChassi, formatRenavam, isRenavamFormat, isValidChassi } from "@/lib/domain/veiculo/identificacao";

/**
 * PATCH /api/v1/carros/:id/identificacao
 * Grava chassi/renavam extraídos do CRLV (fluxo de OCR no /arquivos). Escopo
 * mínimo: só esses dois campos. A validação da placa (documento × pasta) é feita
 * no cliente ANTES de chegar aqui — aqui só validamos o formato de chassi/renavam.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = (await req.json()) as { chassi?: string | null; renavam?: string | null };

    const updates: { chassi?: string; renavam?: string } = {};

    if (body.chassi !== undefined && body.chassi !== null && String(body.chassi).trim()) {
      if (!isValidChassi(body.chassi)) throw new ApiHttpError(400, "INVALID_CHASSI", "Chassi inválido (17 caracteres, sem I/O/Q).");
      updates.chassi = formatChassi(body.chassi);
    }
    if (body.renavam !== undefined && body.renavam !== null && String(body.renavam).trim()) {
      // Estrutural (11 dígitos): o DV é só um aviso na UI — o usuário confirma
      // olhando o documento, e um DV imperfeito não deve barrar um renavam real.
      if (!isRenavamFormat(body.renavam)) throw new ApiHttpError(400, "INVALID_RENAVAM", "Renavam inválido (11 dígitos).");
      updates.renavam = formatRenavam(body.renavam);
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Informe chassi e/ou renavam válidos.");
    }

    const { data: oldData, error: oldError } = await supabase
      .from("carros")
      .select("id, placa, chassi, renavam")
      .eq("id", id)
      .maybeSingle();
    if (oldError) throw new ApiHttpError(500, "CARRO_READ_FAILED", "Falha ao ler o veículo.", oldError);
    if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Veículo não encontrado.");

    const { data, error } = await supabase
      .from("carros")
      .update(updates)
      .eq("id", id)
      .select("id, placa, chassi, renavam")
      .single();
    if (error) throw new ApiHttpError(400, "CARRO_IDENTIFICACAO_UPDATE_FAILED", "Falha ao salvar chassi/renavam.", error);

    await writeAuditLog({
      action: "update",
      table: "carros",
      pk: id,
      actor,
      oldData,
      newData: data,
      details: "Chassi/renavam extraídos do CRLV (OCR no /arquivos)."
    });

    return apiOk(data, { request_id: requestId });
  });
}
