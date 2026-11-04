import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { signFileUrlsSchema } from "@/lib/domain/files/schemas";
import { signExplorerFileUrls } from "@/lib/files/explorer-service";

/**
 * POST /files/sign { fileIds, variant } — URLs assinadas em lote, sob demanda
 * (só o que está visível/selecionado). Mesmo nível de acesso da leitura de
 * pastas: qualquer usuário autenticado.
 */
export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const body = await parseJsonBody(req, signFileUrlsSchema);
    const result = await signExplorerFileUrls(supabase, body.fileIds, body.variant);
    return apiOk(result, { request_id: requestId });
  });
}
