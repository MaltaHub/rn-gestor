import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { deleteStoredObjects, listFolderImageRows, touchFolder } from "@/lib/files/service";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { imageId } = await params;
    const { data: image, error: readError } = await supabase
      .from("arquivos_imagens")
      .select("*")
      .eq("id", imageId)
      .maybeSingle();

    if (readError) {
      throw new ApiHttpError(500, "FILES_IMAGE_READ_FAILED", "Falha ao carregar imagem.", readError);
    }

    if (!image) {
      throw new ApiHttpError(404, "FILES_IMAGE_NOT_FOUND", "Imagem nao encontrada.");
    }

    const { error: deleteError } = await supabase.from("arquivos_imagens").delete().eq("id", imageId);

    if (deleteError) {
      throw new ApiHttpError(400, "FILES_IMAGE_DELETE_FAILED", "Falha ao excluir imagem.", deleteError);
    }

    await deleteStoredObjects(supabase, [image.storage_path]).catch(() => undefined);

    const remaining = await listFolderImageRows(supabase, image.pasta_id);
    await Promise.all(
      remaining.map((row, index) =>
        supabase
          .from("arquivos_imagens")
          .update({
            sort_order: index,
            updated_at: new Date().toISOString()
          })
          .eq("id", row.id)
      )
    ).then((results) => {
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        throw new ApiHttpError(500, "FILES_IMAGE_REINDEX_FAILED", "Falha ao reindexar imagens apos exclusao.", failed.error);
      }
    });

    await touchFolder(supabase, image.pasta_id, actor.userId);

    await writeAuditLog({
      action: "delete",
      table: "arquivos_imagens",
      pk: imageId,
      actor,
      oldData: image,
      details: `Imagem ${image.nome_arquivo} removida da pasta ${image.pasta_id}.`
    });

    return apiOk(
      {
        deleted: true,
        id: imageId,
        folderId: image.pasta_id
      },
      { request_id: requestId }
    );
  });
}
