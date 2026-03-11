import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { applyFolderImageOrder, getFolderDetail, getFolderRowOrThrow, touchFolder } from "@/lib/files/service";

type ReorderPayload = {
  imageIds?: string[];
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { folderId } = await params;
    const folder = await getFolderRowOrThrow(supabase, folderId);
    const body = (await req.json()) as ReorderPayload;

    if (!Array.isArray(body.imageIds) || body.imageIds.length === 0) {
      throw new ApiHttpError(400, "FILES_REORDER_REQUIRED", "Envie a lista completa de imagens ordenadas.");
    }

    await applyFolderImageOrder(supabase, folderId, body.imageIds);
    await touchFolder(supabase, folderId, actor.userId);

    await writeAuditLog({
      action: "update",
      table: "arquivos_imagens",
      pk: folderId,
      actor,
      newData: {
        pasta_id: folderId,
        ordem: body.imageIds
      },
      details: `Imagens reordenadas na pasta ${folder.nome}.`
    });

    const detail = await getFolderDetail(supabase, folderId);
    return apiOk(detail, { request_id: requestId });
  });
}
