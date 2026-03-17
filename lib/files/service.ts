import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ApiHttpError } from "@/lib/api/errors";
import { FILES_BUCKET, FILES_SIGNED_URL_TTL_SECONDS, isPreviewableFile } from "@/lib/files/shared";

type FilesSupabase = SupabaseClient<Database>;
type FolderRow = Database["public"]["Tables"]["arquivos_pastas"]["Row"];
type FileRow = Database["public"]["Tables"]["arquivos_arquivos"]["Row"];

export type FileFolderSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FileItem = {
  id: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  isMissing: boolean;
};

export type FileFolderDetail = {
  folder: FileFolderSummary;
  files: FileItem[];
};

function mapFolderSummary(row: FolderRow, fileCount: number): FileFolderSummary {
  return {
    id: row.id,
    name: row.nome,
    slug: row.nome_slug,
    description: row.descricao,
    fileCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isStorageObjectMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { message?: string; status?: number; statusCode?: number | string };
  const status = Number(candidate.statusCode ?? candidate.status ?? 0);
  const message = String(candidate.message ?? "").toLowerCase();
  return status === 404 || message.includes("object not found");
}

async function createSignedFileUrls(supabase: FilesSupabase, row: FileRow) {
  const storage = supabase.storage.from(row.bucket_id || FILES_BUCKET);
  const canPreview = isPreviewableFile(row.mime_type);

  const [previewResult, downloadResult] = await Promise.all([
    canPreview ? storage.createSignedUrl(row.storage_path, FILES_SIGNED_URL_TTL_SECONDS) : Promise.resolve(null),
    storage.createSignedUrl(row.storage_path, FILES_SIGNED_URL_TTL_SECONDS, { download: row.nome_arquivo })
  ]);

  if (isStorageObjectMissing(previewResult?.error) || isStorageObjectMissing(downloadResult.error)) {
    return {
      previewUrl: null,
      downloadUrl: null,
      isMissing: true
    };
  }

  if (previewResult && (previewResult.error || !previewResult.data?.signedUrl)) {
    throw new ApiHttpError(500, "FILES_PREVIEW_URL_FAILED", "Falha ao assinar URL de visualizacao.", previewResult.error);
  }

  if (downloadResult.error || !downloadResult.data?.signedUrl) {
    throw new ApiHttpError(500, "FILES_DOWNLOAD_URL_FAILED", "Falha ao assinar URL de download.", downloadResult.error);
  }

  return {
    previewUrl: previewResult?.data?.signedUrl ?? null,
    downloadUrl: downloadResult.data.signedUrl,
    isMissing: false
  };
}

async function mapFileItem(supabase: FilesSupabase, row: FileRow): Promise<FileItem> {
  const { previewUrl, downloadUrl, isMissing } = await createSignedFileUrls(supabase, row);

  return {
    id: row.id,
    folderId: row.pasta_id,
    fileName: row.nome_arquivo,
    mimeType: row.mime_type,
    sizeBytes: row.tamanho_bytes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    previewUrl,
    downloadUrl,
    isMissing
  };
}

export async function assertFolderSlugAvailable(
  supabase: FilesSupabase,
  slug: string,
  excludeFolderId?: string | null
) {
  let query = supabase.from("arquivos_pastas").select("id").eq("nome_slug", slug).limit(1);

  if (excludeFolderId) {
    query = query.neq("id", excludeFolderId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_LOOKUP_FAILED", "Falha ao validar nome da pasta.", error);
  }

  if (data) {
    throw new ApiHttpError(409, "FILES_FOLDER_NAME_CONFLICT", "Ja existe uma pasta com este nome.");
  }
}

export async function getFolderRowOrThrow(supabase: FilesSupabase, folderId: string) {
  const { data, error } = await supabase.from("arquivos_pastas").select("*").eq("id", folderId).maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_READ_FAILED", "Falha ao carregar pasta.", error);
  }

  if (!data) {
    throw new ApiHttpError(404, "FILES_FOLDER_NOT_FOUND", "Pasta nao encontrada.");
  }

  return data;
}

export async function listFolderRows(supabase: FilesSupabase) {
  const { data, error } = await supabase.from("arquivos_pastas").select("*").order("nome", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_LIST_FAILED", "Falha ao listar pastas.", error);
  }

  return data ?? [];
}

export async function listFolderSummaries(supabase: FilesSupabase): Promise<FileFolderSummary[]> {
  const folders = await listFolderRows(supabase);

  if (folders.length === 0) {
    return [];
  }

  const folderIds = folders.map((folder) => folder.id);
  const { data: fileRows, error: fileError } = await supabase
    .from("arquivos_arquivos")
    .select("id, pasta_id")
    .in("pasta_id", folderIds);

  if (fileError) {
    throw new ApiHttpError(500, "FILES_COUNT_FAILED", "Falha ao contar arquivos por pasta.", fileError);
  }

  const countByFolder = new Map<string, number>();
  for (const row of fileRows ?? []) {
    countByFolder.set(row.pasta_id, (countByFolder.get(row.pasta_id) ?? 0) + 1);
  }

  return folders.map((folder) => mapFolderSummary(folder, countByFolder.get(folder.id) ?? 0));
}

export async function listFolderFileRows(supabase: FilesSupabase, folderId: string) {
  const { data, error } = await supabase
    .from("arquivos_arquivos")
    .select("*")
    .eq("pasta_id", folderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "FILES_LIST_FAILED", "Falha ao listar arquivos da pasta.", error);
  }

  return data ?? [];
}

export async function getFolderDetail(supabase: FilesSupabase, folderId: string): Promise<FileFolderDetail> {
  const folder = await getFolderRowOrThrow(supabase, folderId);
  const files = await listFolderFileRows(supabase, folderId);
  const signedFiles = await Promise.all(files.map((row) => mapFileItem(supabase, row)));

  return {
    folder: mapFolderSummary(folder, files.length),
    files: signedFiles
  };
}

export async function getNextFolderFileSortOrder(supabase: FilesSupabase, folderId: string) {
  const { data, error } = await supabase
    .from("arquivos_arquivos")
    .select("sort_order")
    .eq("pasta_id", folderId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_SORT_LOOKUP_FAILED", "Falha ao calcular ordem dos arquivos.", error);
  }

  return (data?.sort_order ?? -1) + 1;
}

export async function touchFolder(supabase: FilesSupabase, folderId: string, actorUserId: string | null) {
  const { error } = await supabase
    .from("arquivos_pastas")
    .update({
      updated_at: new Date().toISOString(),
      updated_by: actorUserId
    })
    .eq("id", folderId);

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_TOUCH_FAILED", "Falha ao atualizar timestamp da pasta.", error);
  }
}

export async function applyFolderFileOrder(supabase: FilesSupabase, folderId: string, fileIds: string[]) {
  const rows = await listFolderFileRows(supabase, folderId);
  const existingIds = rows.map((row) => row.id);

  if (existingIds.length !== fileIds.length) {
    throw new ApiHttpError(400, "FILES_REORDER_INVALID_COUNT", "A ordem enviada nao corresponde ao total de arquivos.");
  }

  const existingSet = new Set(existingIds);
  for (const fileId of fileIds) {
    if (!existingSet.has(fileId)) {
      throw new ApiHttpError(400, "FILES_REORDER_INVALID_FILE", "A ordem enviada contem arquivos invalidos.", {
        fileId
      });
    }
  }

  await Promise.all(
    fileIds.map((fileId, index) =>
      supabase
        .from("arquivos_arquivos")
        .update({
          sort_order: index,
          updated_at: new Date().toISOString()
        })
        .eq("id", fileId)
        .eq("pasta_id", folderId)
    )
  ).then((results) => {
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new ApiHttpError(500, "FILES_REORDER_FAILED", "Falha ao persistir nova ordem dos arquivos.", failed.error);
    }
  });
}

export async function deleteStoredObjects(supabase: FilesSupabase, paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(FILES_BUCKET).remove(paths);

  if (error) {
    throw new ApiHttpError(500, "FILES_STORAGE_DELETE_FAILED", "Falha ao remover arquivos do bucket.", error);
  }
}
