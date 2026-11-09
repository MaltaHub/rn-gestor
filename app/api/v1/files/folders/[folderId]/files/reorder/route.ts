import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { describeAudit } from "@/lib/api/audit-context";
import { parseJsonBody } from "@/lib/api/validation";
import { fileReorderSchema } from "@/lib/domain/files/schemas";
import { applyFolderFileOrder, getFolderRowOrThrow, touchFolder } from "@/lib/files/service";
import { syncPhotoFlagsForFolders } from "@/lib/domain/file-automations/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { folderId } = await params;
    const folder = await getFolderRowOrThrow(supabase, folderId);
    const body = await parseJsonBody(req, fileReorderSchema);

    describeAudit(`Arquivos reordenados na pasta ${folder.nome}.`, { batch: true });
    await applyFolderFileOrder(supabase, folderId, body.fileIds);
    await touchFolder(supabase, folderId, actor.userId);

    // A ordem define a capa automatica quando o carro nao tem capa valida.
    await syncPhotoFlagsForFolders(supabase, [folderId]);

    return apiOk({ folderId, fileIds: body.fileIds }, { request_id: requestId });
  });
}
