import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { deleteStoredObjects, getFolderDetail, listFolderFileRows, touchFolder } from "@/lib/files/service";
import { normalizeFileName } from "@/lib/files/shared";

type FileUpdatePayload = {
  fileName?: string;
};

function parseFileName(raw: string | null | undefined) {
  const fileName = normalizeFileName(raw ?? "");

  if (!fileName) {
    throw new ApiHttpError(400, "FILES_NAME_REQUIRED", "Informe o nome do arquivo.");
  }

  if (fileName.length > 240) {
    throw new ApiHttpError(400, "FILES_NAME_TOO_LONG", "O nome do arquivo suporta ate 240 caracteres.");
  }

  return fileName;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { fileId } = await params;
    const body = (await req.json()) as FileUpdatePayload;
    const fileName = parseFileName(body.fileName);
    const { data: current, error: readError } = await supabase
      .from("arquivos_arquivos")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();

    if (readError) {
      throw new ApiHttpError(500, "FILES_READ_FAILED", "Falha ao carregar arquivo.", readError);
    }

    if (!current) {
      throw new ApiHttpError(404, "FILES_NOT_FOUND", "Arquivo nao encontrado.");
    }

    const { error: updateError } = await supabase
      .from("arquivos_arquivos")
      .update({
        nome_arquivo: fileName,
        updated_at: new Date().toISOString()
      })
      .eq("id", fileId);

    if (updateError) {
      throw new ApiHttpError(400, "FILES_UPDATE_FAILED", "Falha ao renomear arquivo.", updateError);
    }

    await touchFolder(supabase, current.pasta_id, actor.userId);

    await writeAuditLog({
      action: "update",
      table: "arquivos_arquivos",
      pk: fileId,
      actor,
      oldData: current,
      newData: {
        ...current,
        nome_arquivo: fileName
      },
      details: `Arquivo ${current.nome_arquivo} renomeado para ${fileName}.`
    });

    const detail = await getFolderDetail(supabase, current.pasta_id);
    return apiOk(detail, { request_id: requestId });
  });
}

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
