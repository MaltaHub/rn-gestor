import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { buildExplorerIndex } from "@/lib/files/explorer-service";

/**
 * GET /files/index — árvore de pastas + metadados de todos os arquivos (sem
 * URLs). O explorer navega e busca em memória a partir disto.
 */
export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const index = await buildExplorerIndex(supabase);
    return apiOk(index, { request_id: requestId });
  });
}
