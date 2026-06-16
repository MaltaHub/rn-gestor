import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { createVendedorShareToken } from "@/lib/domain/usuarios/share";

// GET /api/v1/me/share -> { vendedorToken } para personalizar o WhatsApp dos
// links públicos (catálogo/galeria) que o vendedor compartilha.
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId }) => {
    const vendedorToken = actor.userId ? createVendedorShareToken(actor.userId) : null;
    return apiOk({ vendedorToken }, { request_id: requestId });
  });
}
