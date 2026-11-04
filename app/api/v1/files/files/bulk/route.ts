import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { fileBulkSchema } from "@/lib/domain/files/schemas";
import { bulkDeleteFiles, bulkMoveFiles } from "@/lib/files/explorer-service";

/** POST /files/files/bulk — excluir/mover vários arquivos numa requisição. */
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const body = await parseJsonBody(req, fileBulkSchema);

    if (body.action === "delete") {
      const result = await bulkDeleteFiles({ supabase, actor, fileIds: body.fileIds });
      return apiOk(result, { request_id: requestId });
    }

    const result = await bulkMoveFiles({ supabase, actor, fileIds: body.fileIds, targetFolderId: body.folderId });
    return apiOk(result, { request_id: requestId });
  });
}
