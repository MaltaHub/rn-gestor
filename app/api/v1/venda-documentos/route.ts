import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { createVendaDocumento, listVendaDocumentos } from "@/lib/domain/venda-documentos/service";
import { vendaDocumentoCreateSchema } from "@/lib/domain/venda-documentos/schemas";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const rows = await listVendaDocumentos({
      supabase,
      vendaId: req.nextUrl.searchParams.get("venda_id"),
      carroId: req.nextUrl.searchParams.get("carro_id")
    });
    return apiOk(rows, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = vendaDocumentoCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de documento invalido.", parsed.error);
    }
    const data = await createVendaDocumento({ supabase, actor, row: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}
