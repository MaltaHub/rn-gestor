import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import {
  createDocumentoTemplate,
  listDocumentoTemplates
} from "@/lib/domain/documento-templates/service";
import { documentoTemplateCreateSchema } from "@/lib/domain/documento-templates/schemas";

// Leitura liberada a qualquer autenticado (usuario escolhe template ao criar doc).
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";
    const rows = await listDocumentoTemplates({ supabase, includeInactive });
    return apiOk(rows, { request_id: requestId });
  });
}

// Criar template: GERENTE+.
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = documentoTemplateCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de template invalido.", parsed.error);
    }
    const data = await createDocumentoTemplate({ supabase, actor, row: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}
