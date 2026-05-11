import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { parseJsonBody } from "@/lib/api/validation";
import { fileReorderSchema } from "@/lib/domain/files/schemas";
import { applyFolderFileOrder, getFolderDetail, getFolderRowOrThrow, touchFolder } from "@/lib/files/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { folderId } = await params;
    const folder = await getFolderRowOrThrow(supabase, folderId);
    const body = await parseJsonBody(req, fileReorderSchema);

    await applyFolderFileOrder(supabase, folderId, body.fileIds);
    await touchFolder(supabase, folderId, actor.userId);

    await writeAuditLog({
      action: "update",
      table: "arquivos_arquivos",
      pk: folderId,
      actor,
      newData: {
        pasta_id: folderId,
        ordem: body.fileIds
      },
      details: `Arquivos reordenados na pasta ${folder.nome}.`
    });

    const detail = await getFolderDetail(supabase, folderId);
    return apiOk(detail, { request_id: requestId });
  });
}
