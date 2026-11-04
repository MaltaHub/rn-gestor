import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { prepareUploadsSchema } from "@/lib/domain/files/schemas";
import { getFolderRowOrThrow } from "@/lib/files/service";
import { buildUploadStoragePath, FILES_BUCKET, MAX_FILE_UPLOAD_SIZE_BYTES } from "@/lib/files/shared";

/**
 * POST /files/uploads/prepare — UNICO caminho de upload: devolve URLs de
 * upload assinadas (o browser envia direto ao Storage) e depois chama
 * /uploads/finalize para persistir os metadados.
 */
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    const body = await parseJsonBody(req, prepareUploadsSchema);
    const folderId = body.folderId;
    await getFolderRowOrThrow(supabase, folderId);

    for (const file of body.files) {
      if (file.sizeBytes > MAX_FILE_UPLOAD_SIZE_BYTES) {
        throw new ApiHttpError(
          400,
          "FILES_UPLOAD_TOO_LARGE",
          `O arquivo ${file.fileName} excede o limite de ${Math.round(MAX_FILE_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`
        );
      }
    }

    const prepared = await Promise.all(
      body.files.map(async (file) => {
        const fileId = crypto.randomUUID();
        const storagePath = buildUploadStoragePath(folderId, fileId, file.fileName);
        const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(storagePath);

        if (error || !data?.signedUrl) {
          console.error("[FILES_SIGNED_UPLOAD_FAILED]", { requestId, error });
          throw new ApiHttpError(500, "FILES_SIGNED_UPLOAD_FAILED", "Falha ao gerar URL assinada de upload.");
        }

        return {
          fileId,
          fileName: file.fileName,
          mimeType: file.mimeType || "application/octet-stream",
          sizeBytes: file.sizeBytes,
          storagePath,
          signedUrl: data.signedUrl
        };
      })
    );

    return apiOk({ entries: prepared }, { request_id: requestId });
  });
}
