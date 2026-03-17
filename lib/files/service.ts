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
  parentFolderId: string | null;
  fileCount: number;
  childFolderCount: number;
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
  breadcrumb: FileFolderSummary[];
  childFolders: FileFolderSummary[];
  files: FileItem[];
};

function mapFolderSummary(row: FolderRow, fileCount: number, childFolderCount: number): FileFolderSummary {
  return {
    id: row.id,
    name: row.nome,
    slug: row.nome_slug,
    description: row.descricao,
    parentFolderId: row.parent_folder_id,
    fileCount,
    childFolderCount,
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
  const canPreview = isPreviewableFile(row.mime_type, row.nome_arquivo);

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

function buildFolderCounts(folders: FolderRow[], fileRows: Pick<FileRow, "id" | "pasta_id">[]) {
  const fileCountByFolder = new Map<string, number>();
  for (const row of fileRows) {
    fileCountByFolder.set(row.pasta_id, (fileCountByFolder.get(row.pasta_id) ?? 0) + 1);
  }

  const childCountByFolder = new Map<string, number>();
  for (const folder of folders) {
    if (!folder.parent_folder_id) continue;
    childCountByFolder.set(folder.parent_folder_id, (childCountByFolder.get(folder.parent_folder_id) ?? 0) + 1);
  }

  return { fileCountByFolder, childCountByFolder };
}

async function listFileCountRows(supabase: FilesSupabase, folderIds: string[]) {
  if (folderIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.from("arquivos_arquivos").select("id, pasta_id").in("pasta_id", folderIds);

  if (error) {
    throw new ApiHttpError(500, "FILES_COUNT_FAILED", "Falha ao contar arquivos por pasta.", error);
  }

  return data ?? [];
}

function mapFolderSummariesFromRows(folders: FolderRow[], fileRows: Pick<FileRow, "id" | "pasta_id">[]) {
  const { fileCountByFolder, childCountByFolder } = buildFolderCounts(folders, fileRows);

  return folders.map((folder) =>
    mapFolderSummary(folder, fileCountByFolder.get(folder.id) ?? 0, childCountByFolder.get(folder.id) ?? 0)
  );
}

function buildBreadcrumb(summaryById: Map<string, FileFolderSummary>, folderId: string) {
  const breadcrumb: FileFolderSummary[] = [];
  let current = summaryById.get(folderId) ?? null;

  while (current) {
    breadcrumb.unshift(current);
    current = current.parentFolderId ? (summaryById.get(current.parentFolderId) ?? null) : null;
  }

  return breadcrumb;
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

export async function listFolderSummaries(supabase: FilesSupabase): Promise<FileFolderSummary[]> {
  const folders = await listFolderRows(supabase);

  if (folders.length === 0) {
    return [];
  }

  const fileRows = await listFileCountRows(
    supabase,
    folders.map((folder) => folder.id)
  );

  return mapFolderSummariesFromRows(folders, fileRows);
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

  return data ?? [];
}

export async function getFolderDetail(supabase: FilesSupabase, folderId: string): Promise<FileFolderDetail> {
  const [folder, folders, files] = await Promise.all([
    getFolderRowOrThrow(supabase, folderId),
    listFolderRows(supabase),
    listFolderFileRows(supabase, folderId)
  ]);

  const summaries = mapFolderSummariesFromRows(
    folders,
    await listFileCountRows(
      supabase,
      folders.map((entry) => entry.id)
    )
  );
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const currentSummary = summaryById.get(folder.id);

  if (!currentSummary) {
    throw new ApiHttpError(500, "FILES_FOLDER_SUMMARY_FAILED", "Falha ao montar resumo da pasta.");
  }

  const signedFiles = await Promise.all(files.map((row) => mapFileItem(supabase, row)));

  return {
    folder: currentSummary,
    breadcrumb: buildBreadcrumb(summaryById, folder.id),
    childFolders: summaries
      .filter((summary) => summary.parentFolderId === folder.id)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
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
