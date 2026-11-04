import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ApiHttpError } from "@/lib/api/errors";
import { FILES_BUCKET, FILES_SIGNED_URL_TTL_SECONDS, isPreviewableFile } from "@/lib/files/shared";

type FilesSupabase = SupabaseClient<Database>;
type FolderRow = Database["public"]["Tables"]["arquivos_pastas"]["Row"];
type FileRow = Database["public"]["Tables"]["arquivos_arquivos"]["Row"];

/** Arquivo com URLs assinadas — usado pelas telas de veículo (vendedor/catálogo). */
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

/** Assina em UMA chamada ao Storage (por bucket) — nunca uma por arquivo. */
async function signRowsInBatch(supabase: FilesSupabase, rows: FileRow[]) {
  const signedByPath = new Map<string, string | null>();
  const byBucket = new Map<string, FileRow[]>();
  for (const row of rows) {
    const bucket = row.bucket_id || FILES_BUCKET;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row]);
  }

  for (const [bucket, bucketRows] of byBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        bucketRows.map((row) => row.storage_path),
        FILES_SIGNED_URL_TTL_SECONDS
      );
    if (error) {
      console.error("[FILES_SIGN_FAILED]", { bucket, error });
      throw new ApiHttpError(500, "FILES_SIGN_FAILED", "Falha ao assinar URLs dos arquivos.");
    }
    for (const entry of data ?? []) {
      if (entry.path) signedByPath.set(entry.path, entry.error ? null : entry.signedUrl);
    }
  }

  return signedByPath;
}

/** O parâmetro `download` fica fora do token da URL assinada. */
export function withDownloadParam(signedUrl: string, fileName: string) {
  return `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
}

function mapSignedFileItem(row: FileRow, signedUrl: string | null): FileItem {
  return {
    id: row.id,
    folderId: row.pasta_id,
    fileName: row.nome_arquivo,
    mimeType: row.mime_type,
    sizeBytes: row.tamanho_bytes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    previewUrl: signedUrl && isPreviewableFile(row.mime_type, row.nome_arquivo) ? signedUrl : null,
    downloadUrl: signedUrl ? withDownloadParam(signedUrl, row.nome_arquivo) : null,
    isMissing: !signedUrl
  };
}

export async function assertFolderSlugAvailable(
  supabase: FilesSupabase,
  slug: string,
  parentFolderId?: string | null,
  excludeFolderId?: string | null
) {
  let query = supabase.from("arquivos_pastas").select("id").eq("nome_slug", slug).limit(1);

  if (parentFolderId) {
    query = query.eq("parent_folder_id", parentFolderId);
  } else {
    query = query.is("parent_folder_id", null);
  }

  if (excludeFolderId) {
    query = query.neq("id", excludeFolderId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_LOOKUP_FAILED", "Falha ao validar nome da pasta.", error);
  }

  if (data) {
    throw new ApiHttpError(409, "FILES_FOLDER_NAME_CONFLICT", "Ja existe uma pasta com este nome neste nivel.");
  }
}

export async function assertFolderParentValid(
  supabase: FilesSupabase,
  parentFolderId: string | null | undefined,
  currentFolderId?: string | null
) {
  const normalizedParentId = parentFolderId ?? null;
  if (!normalizedParentId) {
    return null;
  }

  if (currentFolderId && normalizedParentId === currentFolderId) {
    throw new ApiHttpError(400, "FILES_FOLDER_PARENT_SELF", "Uma pasta nao pode ser filha dela mesma.");
  }

  const folders = await listFolderRows(supabase);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const parent = folderById.get(normalizedParentId);

  if (!parent) {
    throw new ApiHttpError(404, "FILES_FOLDER_PARENT_NOT_FOUND", "Pasta pai nao encontrada.");
  }

  if (currentFolderId) {
    let cursor = parent.parent_folder_id;
    while (cursor) {
      if (cursor === currentFolderId) {
        throw new ApiHttpError(400, "FILES_FOLDER_PARENT_CYCLE", "A pasta pai escolhida criaria um ciclo invalido.");
      }

      cursor = folderById.get(cursor)?.parent_folder_id ?? null;
    }
  }

  return parent;
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
  const { data, error } = await supabase
    .from("arquivos_pastas")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_LIST_FAILED", "Falha ao listar pastas.", error);
  }

  return data ?? [];
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

/** Arquivos de uma pasta já com URLs assinadas (preview/download). */
export async function listSignedFolderFiles(supabase: FilesSupabase, folderId: string): Promise<FileItem[]> {
  const rows = await listFolderFileRows(supabase, folderId);
  if (rows.length === 0) return [];
  const signedByPath = await signRowsInBatch(supabase, rows);
  return rows.map((row) => mapSignedFileItem(row, signedByPath.get(row.storage_path) ?? null));
}

/** Assina (preview) um conjunto de arquivos por id — usado p/ resolver fotos de capa em lote. */
export async function signPreviewUrlsByFileIds(
  supabase: FilesSupabase,
  fileIds: string[]
): Promise<Record<string, string | null>> {
  const ids = Array.from(new Set(fileIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return {};

  const { data, error } = await supabase.from("arquivos_arquivos").select("*").in("id", ids);
  if (error) {
    throw new ApiHttpError(500, "FILES_LOOKUP_FAILED", "Falha ao carregar arquivos.", error);
  }

  const rows = data ?? [];
  if (rows.length === 0) return {};
  const signedByPath = await signRowsInBatch(supabase, rows);
  return Object.fromEntries(
    rows.map((row) => [row.id, mapSignedFileItem(row, signedByPath.get(row.storage_path) ?? null).previewUrl] as const)
  );
}

export async function listFolderSubtreeRows(supabase: FilesSupabase, rootFolderId: string) {
  const folders = await listFolderRows(supabase);
  const childrenByParent = new Map<string, FolderRow[]>();

  for (const folder of folders) {
    if (!folder.parent_folder_id) continue;
    const bucket = childrenByParent.get(folder.parent_folder_id) ?? [];
    bucket.push(folder);
    childrenByParent.set(folder.parent_folder_id, bucket);
  }

  const root = folders.find((folder) => folder.id === rootFolderId);
  if (!root) {
    throw new ApiHttpError(404, "FILES_FOLDER_NOT_FOUND", "Pasta nao encontrada.");
  }

  const queue = [root];
  const subtree: FolderRow[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    subtree.push(current);
    queue.push(...(childrenByParent.get(current.id) ?? []));
  }

  return subtree;
}

export async function listFolderSubtreeFileRows(supabase: FilesSupabase, rootFolderId: string) {
  const subtreeFolders = await listFolderSubtreeRows(supabase, rootFolderId);
  const folderIds = subtreeFolders.map((folder) => folder.id);

  const { data, error } = await supabase
    .from("arquivos_arquivos")
    .select("*")
    .in("pasta_id", folderIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "FILES_LIST_FAILED", "Falha ao listar arquivos da arvore da pasta.", error);
  }

  return { folderIds, files: data ?? [] };
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

  const currentOrder = new Map(rows.map((row) => [row.id, row.sort_order]));
  const now = new Date().toISOString();
  // Só regrava quem mudou de posição.
  const changed = fileIds
    .map((fileId, index) => ({ fileId, index }))
    .filter(({ fileId, index }) => currentOrder.get(fileId) !== index);

  const results = await Promise.all(
    changed.map(({ fileId, index }) =>
      supabase
        .from("arquivos_arquivos")
        .update({ sort_order: index, updated_at: now })
        .eq("id", fileId)
        .eq("pasta_id", folderId)
    )
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new ApiHttpError(500, "FILES_REORDER_FAILED", "Falha ao persistir nova ordem dos arquivos.", failed.error);
  }
}

export async function deleteStoredObjects(supabase: FilesSupabase, paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(FILES_BUCKET).remove(paths);

  if (error) {
    throw new ApiHttpError(500, "FILES_STORAGE_DELETE_FAILED", "Falha ao remover arquivos do bucket.", error);
  }
}
