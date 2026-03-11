import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteStoredObjects,
  getFolderDetail,
  getFolderRowOrThrow,
  getNextFolderImageSortOrder,
  touchFolder
} from "@/lib/files/service";
import { FILES_BUCKET, MAX_IMAGE_UPLOAD_SIZE_BYTES, sanitizeFileName } from "@/lib/files/shared";

const UPLOAD_CONCURRENCY = 3;

function assertFileIsImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new ApiHttpError(400, "FILES_UPLOAD_INVALID_TYPE", `O arquivo ${file.name} nao e uma imagem suportada.`);
  }

  if (file.size <= 0) {
    throw new ApiHttpError(400, "FILES_UPLOAD_EMPTY", `O arquivo ${file.name} esta vazio.`);
  }

  if (file.size > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
    throw new ApiHttpError(
      400,
      "FILES_UPLOAD_TOO_LARGE",
      `O arquivo ${file.name} excede o limite de ${Math.round(MAX_IMAGE_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`
    );
  }
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number) {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: "fulfilled", value };
      } catch (error) {
        results[currentIndex] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { folderId } = await params;
    const folder = await getFolderRowOrThrow(supabase, folderId);
    const formData = await req.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      throw new ApiHttpError(400, "FILES_UPLOAD_REQUIRED", "Selecione ao menos uma imagem para upload.");
    }

    const nextSortStart = await getNextFolderImageSortOrder(supabase, folderId);

    const preparedUploads = files.map((file, index) => {
      assertFileIsImage(file);

      const imageId = crypto.randomUUID();
      const storagePath = `${folderId}/${imageId}-${sanitizeFileName(file.name)}`;

      return {
        file,
        insertRow: {
          id: imageId,
          pasta_id: folderId,
          bucket_id: FILES_BUCKET,
          storage_path: storagePath,
          nome_arquivo: file.name,
          mime_type: file.type,
          tamanho_bytes: file.size,
          sort_order: nextSortStart + index,
          uploaded_by: actor.userId
        } satisfies Database["public"]["Tables"]["arquivos_imagens"]["Insert"]
      };
    });

    const uploadResults = await runWithConcurrency(
      preparedUploads.map(({ file, insertRow }) => async () => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await supabase.storage.from(FILES_BUCKET).upload(insertRow.storage_path, buffer, {
          cacheControl: "3600",
          contentType: insertRow.mime_type,
          upsert: false
        });

        if (uploadError) {
          throw new ApiHttpError(
            400,
            "FILES_STORAGE_UPLOAD_FAILED",
            `Falha ao enviar ${insertRow.nome_arquivo} para o bucket.`,
            uploadError
          );
        }

        return insertRow.storage_path;
      }),
      UPLOAD_CONCURRENCY
    );

    const uploadedPaths = preparedUploads
      .filter((_, index) => uploadResults[index]?.status === "fulfilled")
      .map((entry) => entry.insertRow.storage_path);

    const firstRejectedUpload = uploadResults.find((result): result is PromiseRejectedResult => result.status === "rejected");

    if (firstRejectedUpload) {
      await deleteStoredObjects(supabase, uploadedPaths).catch(() => undefined);
      throw firstRejectedUpload.reason;
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from("arquivos_imagens")
      .insert(preparedUploads.map((entry) => entry.insertRow))
      .select("*");

    if (insertError) {
      await deleteStoredObjects(supabase, uploadedPaths);
      throw new ApiHttpError(400, "FILES_IMAGE_METADATA_FAILED", "Falha ao persistir metadados das imagens.", insertError);
    }

    await touchFolder(supabase, folderId, actor.userId);

    await writeAuditLog({
      action: "create",
      table: "arquivos_imagens",
      pk: folderId,
      actor,
      newData: {
        pasta_id: folderId,
        imagens: insertedRows?.map((row) => ({
          id: row.id,
          nome_arquivo: row.nome_arquivo,
          tamanho_bytes: row.tamanho_bytes
        }))
      },
      details: `Upload de ${files.length} imagem(ns) na pasta ${folder.nome}.`,
      emLote: files.length > 1
    });

    const detail = await getFolderDetail(supabase, folderId);
    return apiOk(detail, { request_id: requestId });
  });
}
