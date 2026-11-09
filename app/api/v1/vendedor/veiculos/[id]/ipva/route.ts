import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { confirmarIpvaPago } from "@/lib/domain/vendedor/service";

const bodySchema = z.object({ ano: z.number().int() });

// POST /api/v1/vendedor/veiculos/:id/ipva { ano } — o vendedor confirma no
// fluxo de venda que o IPVA do ano está pago (só registra; nunca rebaixa).
// Qualquer cargo que vende pode: é o dado que sai no recibo/contrato.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiHttpError(400, "INVALID_PAYLOAD", "Informe o ano do IPVA.");
    const data = await confirmarIpvaPago(supabase, id, parsed.data.ano);
    return apiOk(data, { request_id: requestId });
  });
}
