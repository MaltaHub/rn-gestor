import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ApiHttpError } from "@/lib/api/errors";
import { FILES_BUCKET, FILES_SIGNED_URL_TTL_SECONDS } from "@/lib/files/shared";

type FilesSupabase = SupabaseClient<Database>;
type FolderRow = Database["public"]["Tables"]["arquivos_pastas"]["Row"];
type ImageRow = Database["public"]["Tables"]["arquivos_imagens"]["Row"];

export type FileFolderSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FileImageItem = {
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
  images: FileImageItem[];
};

function mapFolderSummary(row: FolderRow, imageCount: number): FileFolderSummary {
  return {
    id: row.id,
    name: row.nome,
    slug: row.nome_slug,
    description: row.descricao,
    imageCount,
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

async function createSignedImageUrls(supabase: FilesSupabase, row: ImageRow) {
  const storage = supabase.storage.from(row.bucket_id || FILES_BUCKET);

  const [previewResult, downloadResult] = await Promise.all([
    storage.createSignedUrl(row.storage_path, FILES_SIGNED_URL_TTL_SECONDS),
    storage.createSignedUrl(row.storage_path, FILES_SIGNED_URL_TTL_SECONDS, { download: row.nome_arquivo })
  ]);

  if (isStorageObjectMissing(previewResult.error) || isStorageObjectMissing(downloadResult.error)) {
    return {
      previewUrl: null,
      downloadUrl: null,
      isMissing: true
    };
  }

  if (previewResult.error || !previewResult.data?.signedUrl) {
    throw new ApiHttpError(500, "FILES_PREVIEW_URL_FAILED", "Falha ao assinar URL de visualizacao.", previewResult.error);
  }

  if (downloadResult.error || !downloadResult.data?.signedUrl) {
    throw new ApiHttpError(500, "FILES_DOWNLOAD_URL_FAILED", "Falha ao assinar URL de download.", downloadResult.error);
  }

  return {
    previewUrl: previewResult.data.signedUrl,
    downloadUrl: downloadResult.data.signedUrl,
    isMissing: false
  };
}

async function mapImageItem(supabase: FilesSupabase, row: ImageRow): Promise<FileImageItem> {
  const { previewUrl, downloadUrl, isMissing } = await createSignedImageUrls(supabase, row);

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
  const { data: imageRows, error: imageError } = await supabase
    .from("arquivos_imagens")
    .select("id, pasta_id")
    .in("pasta_id", folderIds);

  if (imageError) {
    throw new ApiHttpError(500, "FILES_IMAGE_COUNT_FAILED", "Falha ao contar imagens por pasta.", imageError);
  }

  const countByFolder = new Map<string, number>();
  for (const row of imageRows ?? []) {
    countByFolder.set(row.pasta_id, (countByFolder.get(row.pasta_id) ?? 0) + 1);
  }

  return folders.map((folder) => mapFolderSummary(folder, countByFolder.get(folder.id) ?? 0));
}

export async function listFolderImageRows(supabase: FilesSupabase, folderId: string) {
  const { data, error } = await supabase
    .from("arquivos_imagens")
    .select("*")
    .eq("pasta_id", folderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "FILES_IMAGE_LIST_FAILED", "Falha ao listar imagens da pasta.", error);
  }

  return data ?? [];
}

export async function getFolderDetail(supabase: FilesSupabase, folderId: string): Promise<FileFolderDetail> {
  const folder = await getFolderRowOrThrow(supabase, folderId);
  const images = await listFolderImageRows(supabase, folderId);
  const signedImages = await Promise.all(images.map((row) => mapImageItem(supabase, row)));

  return {
    folder: mapFolderSummary(folder, images.length),
    images: signedImages
  };
}

export async function getNextFolderImageSortOrder(supabase: FilesSupabase, folderId: string) {
  const { data, error } = await supabase
    .from("arquivos_imagens")
    .select("sort_order")
    .eq("pasta_id", folderId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_IMAGE_SORT_LOOKUP_FAILED", "Falha ao calcular ordem das imagens.", error);
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

export async function applyFolderImageOrder(supabase: FilesSupabase, folderId: string, imageIds: string[]) {
  const rows = await listFolderImageRows(supabase, folderId);
  const existingIds = rows.map((row) => row.id);

  if (existingIds.length !== imageIds.length) {
    throw new ApiHttpError(400, "FILES_REORDER_INVALID_COUNT", "A ordem enviada nao corresponde ao total de imagens.");
  }

  const existingSet = new Set(existingIds);
  for (const imageId of imageIds) {
    if (!existingSet.has(imageId)) {
      throw new ApiHttpError(400, "FILES_REORDER_INVALID_IMAGE", "A ordem enviada contem imagens invalidas.", {
        imageId
      });
    }
  }

  await Promise.all(
    imageIds.map((imageId, index) =>
      supabase
        .from("arquivos_imagens")
        .update({
          sort_order: index,
          updated_at: new Date().toISOString()
        })
        .eq("id", imageId)
        .eq("pasta_id", folderId)
    )
  ).then((results) => {
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new ApiHttpError(500, "FILES_REORDER_FAILED", "Falha ao persistir nova ordem das imagens.", failed.error);
    }
  });
}

export async function deleteStoredObjects(supabase: FilesSupabase, paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(FILES_BUCKET).remove(paths);

  if (error) {
    throw new ApiHttpError(500, "FILES_STORAGE_DELETE_FAILED", "Falha ao remover imagens do bucket.", error);
  }
}
