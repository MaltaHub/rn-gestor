import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { createCarroShareToken } from "@/lib/domain/carros/share";
import { createVendedorShareToken } from "@/lib/domain/usuarios/share";

// GET /api/v1/carros/:id/compartilhar -> { token, url } (link fixo de fotos do veiculo).
// A URL leva ?v=<token-vendedor> para o WhatsApp da galeria apontar ao vendedor
// que gerou o link (fallback: numero padrao da loja).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId }) => {
    const { id } = await params;
    const token = createCarroShareToken(id);
    const vendedorToken = actor.userId ? createVendedorShareToken(actor.userId) : null;
    const suffix = vendedorToken ? `?v=${encodeURIComponent(vendedorToken)}` : "";
    const url = `${req.nextUrl.origin}/galeria/${token}${suffix}`;
    return apiOk({ token, url }, { request_id: requestId });
  });
}
