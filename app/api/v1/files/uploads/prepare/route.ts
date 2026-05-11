import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { requireRole } from "@/lib/api/auth";
import { parseJsonBody } from "@/lib/api/validation";
import { prepareUploadsSchema } from "@/lib/domain/files/schemas";
import { FILES_BUCKET, MAX_FILE_UPLOAD_SIZE_BYTES, sanitizeFileName } from "@/lib/files/shared";

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const body = await parseJsonBody(req, prepareUploadsSchema);
    const folderId = body.folderId;

    const prepared = await Promise.all(
      body.files.map(async (f) => {
        if (f.sizeBytes > MAX_FILE_UPLOAD_SIZE_BYTES) {
          throw new ApiHttpError(
            400,
            "FILES_UPLOAD_TOO_LARGE",
            `O arquivo ${f.fileName} excede o limite de ${Math.round(MAX_FILE_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`
          );
        }

        const fileId = crypto.randomUUID();
        const storagePath = `${folderId}/${fileId}-${sanitizeFileName(f.fileName)}`;
        const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(storagePath);

        if (error || !data?.signedUrl) {
          throw new ApiHttpError(500, "FILES_SIGNED_UPLOAD_FAILED", "Falha ao gerar URL assinada de upload.", error);
        }

        return {
          fileId,
          fileName: f.fileName,
          mimeType: f.mimeType || "application/octet-stream",
          sizeBytes: f.sizeBytes,
          storagePath,
          signedUrl: data.signedUrl
        };
      })
    );

    return apiOk({ entries: prepared }, { request_id: requestId });
  });
}
