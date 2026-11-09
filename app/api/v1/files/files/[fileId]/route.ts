import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { bulkDeleteFiles, bulkMoveFiles, toExplorerFile } from "@/lib/files/explorer-service";
import { touchFolder } from "@/lib/files/service";
import { parseJsonBody } from "@/lib/api/validation";
import { fileUpdateSchema } from "@/lib/domain/files/schemas";
import { normalizeFileName } from "@/lib/files/shared";

/** PATCH { fileName?, folderId? } — renomear e/ou mover um arquivo. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { fileId } = await params;
    const body = await parseJsonBody(req, fileUpdateSchema);

    const { data: current, error: readError } = await supabase
      .from("arquivos_arquivos")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();

    if (readError) {
      console.error("[FILES_READ_FAILED]", { requestId, readError });
      throw new ApiHttpError(500, "FILES_READ_FAILED", "Falha ao carregar arquivo.");
    }
    if (!current) {
      throw new ApiHttpError(404, "FILES_NOT_FOUND", "Arquivo nao encontrado.");
    }

    if (body.folderId && body.folderId !== current.pasta_id) {
      await bulkMoveFiles({ supabase, actor, fileIds: [fileId], targetFolderId: body.folderId });
    }

    if (body.fileName !== undefined) {
      const fileName = normalizeFileName(body.fileName);
      if (!fileName) {
        throw new ApiHttpError(400, "FILES_NAME_REQUIRED", "Informe o nome do arquivo.");
      }

      if (fileName !== current.nome_arquivo) {
        const { error: updateError } = await supabase
          .from("arquivos_arquivos")
          .update({ nome_arquivo: fileName, updated_at: new Date().toISOString() })
          .eq("id", fileId);

        if (updateError) {
          console.error("[FILES_UPDATE_FAILED]", { requestId, updateError });
          throw new ApiHttpError(400, "FILES_UPDATE_FAILED", "Falha ao renomear arquivo.");
        }

        await touchFolder(supabase, current.pasta_id, actor.userId);
      }
    }

    const { data: updated, error: rereadError } = await supabase
      .from("arquivos_arquivos")
      .select("*")
      .eq("id", fileId)
      .single();

    if (rereadError) {
      console.error("[FILES_READ_FAILED]", { requestId, rereadError });
      throw new ApiHttpError(500, "FILES_READ_FAILED", "Falha ao carregar arquivo.");
    }

    return apiOk({ file: toExplorerFile(updated) }, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { fileId } = await params;
    const { deletedIds } = await bulkDeleteFiles({ supabase, actor, fileIds: [fileId] });

    if (deletedIds.length === 0) {
      throw new ApiHttpError(404, "FILES_NOT_FOUND", "Arquivo nao encontrado.");
    }

    return apiOk({ deleted: true, id: fileId }, { request_id: requestId });
  });
}
