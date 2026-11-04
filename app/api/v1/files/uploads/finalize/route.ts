import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { finalizeUploadsSchema } from "@/lib/domain/files/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { FILES_BUCKET, isUploadStoragePathFor } from "@/lib/files/shared";
import { deleteStoredObjects, getFolderRowOrThrow, getNextFolderFileSortOrder, touchFolder } from "@/lib/files/service";
import { toExplorerFile } from "@/lib/files/explorer-service";
import { writeAuditLog } from "@/lib/api/audit";
import { syncPhotoFlagsForFolders } from "@/lib/domain/file-automations/service";

export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const body = await parseJsonBody(req, finalizeUploadsSchema);
    const { folderId, entries } = body;
    const folder = await getFolderRowOrThrow(supabase, folderId);

    // So aceita paths gerados pelo /prepare desta pasta (nunca um objeto arbitrario do bucket).
    const foreign = entries.find((entry) => !isUploadStoragePathFor(entry.storagePath, folderId, entry.fileId));
    if (foreign) {
      throw new ApiHttpError(400, "FILES_UPLOAD_PATH_INVALID", "Upload nao corresponde a pasta informada.");
    }

    const startSort = await getNextFolderFileSortOrder(supabase, folderId);
    const rows: Database["public"]["Tables"]["arquivos_arquivos"]["Insert"][] = entries.map((entry, index) => ({
      id: entry.fileId,
      pasta_id: folderId,
      bucket_id: FILES_BUCKET,
      storage_path: entry.storagePath,
      nome_arquivo: entry.fileName,
      mime_type: entry.mimeType || "application/octet-stream",
      tamanho_bytes: entry.sizeBytes,
      sort_order: startSort + index,
      uploaded_by: actor.userId
    }));

    const { data, error } = await supabase.from("arquivos_arquivos").insert(rows).select("*");
    if (error) {
      console.error("[FILES_METADATA_FAILED]", { requestId, error });
      await deleteStoredObjects(
        supabase,
        entries.map((entry) => entry.storagePath)
      ).catch(() => undefined);
      throw new ApiHttpError(400, "FILES_METADATA_FAILED", "Falha ao persistir metadados dos arquivos.");
    }

    await touchFolder(supabase, folderId, actor.userId);
    await syncPhotoFlagsForFolders(supabase, [folderId]);

    await writeAuditLog({
      action: "create",
      table: "arquivos_arquivos",
      pk: folderId,
      actor,
      newData: {
        pasta_id: folderId,
        arquivos: data?.map((row) => ({
          id: row.id,
          nome_arquivo: row.nome_arquivo,
          mime_type: row.mime_type,
          tamanho_bytes: row.tamanho_bytes
        }))
      },
      details: `Upload de ${entries.length} arquivo(s) na pasta ${folder.nome}.`,
      emLote: entries.length > 1
    });

    return apiOk({ folderId, files: (data ?? []).map(toExplorerFile) }, { request_id: requestId });
  });
}
