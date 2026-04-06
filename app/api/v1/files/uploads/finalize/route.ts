import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { requireRole } from "@/lib/api/auth";
import type { Database } from "@/lib/supabase/database.types";
import { FILES_BUCKET } from "@/lib/files/shared";
import { deleteStoredObjects, getFolderDetail, getNextFolderFileSortOrder, touchFolder } from "@/lib/files/service";
import { writeAuditLog } from "@/lib/api/audit";

type FinalizeEntry = {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const body = (await req.json().catch(() => null)) as
      | { folderId?: string; entries?: FinalizeEntry[] }
      | null;

    const folderId = String(body?.folderId ?? "").trim();
    const entries = Array.isArray(body?.entries) ? body!.entries! : [];

    if (!folderId || entries.length === 0) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "folderId e entries sao obrigatorios.");
    }

    const startSort = await getNextFolderFileSortOrder(supabase, folderId);
    const rows: Database["public"]["Tables"]["arquivos_arquivos"]["Insert"][] = entries.map((e, idx) => ({
      id: e.fileId,
      pasta_id: folderId,
      bucket_id: FILES_BUCKET,
      storage_path: e.storagePath,
      nome_arquivo: e.fileName,
      mime_type: e.mimeType,
      tamanho_bytes: e.sizeBytes,
      sort_order: startSort + idx,
      uploaded_by: actor.userId
    }));

    const { data, error } = await supabase.from("arquivos_arquivos").insert(rows as never).select("*");
    if (error) {
      // best-effort cleanup
      await deleteStoredObjects(
        supabase,
        entries.map((e) => e.storagePath)
      ).catch(() => undefined);
      throw new ApiHttpError(400, "FILES_METADATA_FAILED", "Falha ao persistir metadados dos arquivos.", error);
    }

    await touchFolder(supabase, folderId, actor.userId);

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
      details: `Upload direto de ${entries.length} arquivo(s) na pasta`,
      emLote: entries.length > 1
    });

    const detail = await getFolderDetail(supabase, folderId);
    return apiOk(detail, { request_id: requestId });
  });
}

