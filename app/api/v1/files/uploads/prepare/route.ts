import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { requireRole } from "@/lib/api/auth";
import { FILES_BUCKET, MAX_FILE_UPLOAD_SIZE_BYTES, sanitizeFileName } from "@/lib/files/shared";

type PrepareUploadFile = {
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
};

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const body = (await req.json().catch(() => null)) as
      | { folderId?: string; files?: PrepareUploadFile[] }
      | null;

    const folderId = String(body?.folderId ?? "").trim();
    const files = Array.isArray(body?.files) ? body!.files! : [];

    if (!folderId) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "folderId obrigatorio.");
    }
    if (files.length === 0) {
      throw new ApiHttpError(400, "FILES_UPLOAD_REQUIRED", "Envie os metadados dos arquivos para preparar upload.");
    }

    const prepared = await Promise.all(
      files.map(async (f) => {
        if (!Number.isFinite(f.sizeBytes) || f.sizeBytes <= 0) {
          throw new ApiHttpError(400, "FILES_UPLOAD_EMPTY", `O arquivo ${f.fileName} esta vazio.`);
        }
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

