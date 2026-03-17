import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { deleteStoredObjects, listFolderFileRows, touchFolder } from "@/lib/files/service";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { fileId } = await params;
    const { data: file, error: readError } = await supabase
      .from("arquivos_arquivos")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();

    if (readError) {
      throw new ApiHttpError(500, "FILES_READ_FAILED", "Falha ao carregar arquivo.", readError);
    }

    if (!file) {
      throw new ApiHttpError(404, "FILES_NOT_FOUND", "Arquivo nao encontrado.");
    }

    const { error: deleteError } = await supabase.from("arquivos_arquivos").delete().eq("id", fileId);

    if (deleteError) {
      throw new ApiHttpError(400, "FILES_DELETE_FAILED", "Falha ao excluir arquivo.", deleteError);
    }

    await deleteStoredObjects(supabase, [file.storage_path]).catch(() => undefined);

    const remaining = await listFolderFileRows(supabase, file.pasta_id);
    await Promise.all(
      remaining.map((row, index) =>
        supabase
          .from("arquivos_arquivos")
          .update({
            sort_order: index,
            updated_at: new Date().toISOString()
          })
          .eq("id", row.id)
      )
    ).then((results) => {
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        throw new ApiHttpError(500, "FILES_REINDEX_FAILED", "Falha ao reindexar arquivos apos exclusao.", failed.error);
      }
    });

    await touchFolder(supabase, file.pasta_id, actor.userId);

    await writeAuditLog({
      action: "delete",
      table: "arquivos_arquivos",
      pk: fileId,
      actor,
      oldData: file,
      details: `Arquivo ${file.nome_arquivo} removido da pasta ${file.pasta_id}.`
    });

    return apiOk(
      {
        deleted: true,
        id: fileId,
        folderId: file.pasta_id
      },
      { request_id: requestId }
    );
  });
}
