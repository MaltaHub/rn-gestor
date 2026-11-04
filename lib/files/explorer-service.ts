import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import {
  loadFolderAutomationIndex,
  resolvePhotoCarIdsForFolders,
  syncPhotoFlagsForCarIds,
  type FolderAutomationInfo
} from "@/lib/domain/file-automations/service";
import type {
  ExplorerFile,
  ExplorerFolder,
  ExplorerIndex,
  SignedUrlEntry,
  SignedUrlVariant,
  SignUrlsResponse
} from "@/lib/files/explorer-types";
import { deleteStoredObjects, getFolderRowOrThrow, getNextFolderFileSortOrder, touchFolder } from "@/lib/files/service";
import { FILES_BUCKET } from "@/lib/files/shared";
import type { Database } from "@/lib/supabase/database.types";

type FilesSupabase = SupabaseClient<Database>;
type FolderRow = Database["public"]["Tables"]["arquivos_pastas"]["Row"];
type FileRow = Database["public"]["Tables"]["arquivos_arquivos"]["Row"];

/** Limite de linhas por resposta do PostgREST (max_rows do projeto). */
const PAGE_SIZE = 1000;
const ID_CHUNK = 150;
/**
 * TTL das URLs do explorer. Mais longo que o padrão para o cache do navegador
 * reaproveitar a mesma URL (o cliente guarda e reusa até perto de expirar).
 */
export const EXPLORER_SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;
export const EXPLORER_SIGN_MAX_IDS = 300;
const THUMB_SIGN_CONCURRENCY = 8;
/** Thumbnails via Image Transformations do Storage (cobrado por imagem de origem/mês). */
const THUMBNAILS_ENABLED = process.env.FILES_THUMBNAILS?.trim().toLowerCase() !== "off";
const THUMB_TRANSFORM = { width: 400, height: 400, resize: "contain" as const, quality: 70 };
/** Formatos que o transformador do Storage aceita como origem. */
const TRANSFORMABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

const FILE_INDEX_COLUMNS = "id, pasta_id, nome_arquivo, mime_type, tamanho_bytes, sort_order, created_at, updated_at";
type FileIndexRow = Pick<
  FileRow,
  "id" | "pasta_id" | "nome_arquivo" | "mime_type" | "tamanho_bytes" | "sort_order" | "created_at" | "updated_at"
>;

export function toExplorerFile(row: FileIndexRow): ExplorerFile {
  return {
    id: row.id,
    folderId: row.pasta_id,
    name: row.nome_arquivo,
    mimeType: row.mime_type,
    sizeBytes: row.tamanho_bytes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toExplorerFolder(row: FolderRow, automation?: FolderAutomationInfo | null): ExplorerFolder {
  return {
    id: row.id,
    parentId: row.parent_folder_id,
    name: row.nome,
    displayName: automation?.displayName || row.nome,
    description: row.descricao,
    automationKey: automation?.automationKey ?? null,
    automationRepositoryKey: automation?.automationRepositoryKey ?? null,
    managedCarroId: automation?.managedCarroId ?? null,
    isAutomationPaused: automation?.isAutomationPaused ?? false,
    vehicle: automation?.vehicle ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function readAllFolders(supabase: FilesSupabase) {
  const rows: FolderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("arquivos_pastas")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[FILES_FOLDER_LIST_FAILED]", { error });
      throw new ApiHttpError(500, "FILES_FOLDER_LIST_FAILED", "Falha ao listar pastas.");
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function readAllFileIndexRows(supabase: FilesSupabase) {
  const rows: FileIndexRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("arquivos_arquivos")
      .select(FILE_INDEX_COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[FILES_LIST_FAILED]", { error });
      throw new ApiHttpError(500, "FILES_LIST_FAILED", "Falha ao listar arquivos.");
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Índice completo do explorer: pastas + metadados de arquivos, sem URLs. */
export async function buildExplorerIndex(supabase: FilesSupabase): Promise<ExplorerIndex> {
  const [folders, files, automation] = await Promise.all([
    readAllFolders(supabase),
    readAllFileIndexRows(supabase),
    loadFolderAutomationIndex(supabase)
  ]);

  return {
    folders: folders.map((row) => toExplorerFolder(row, automation.get(row.id))),
    files: files.map(toExplorerFile),
    generatedAt: new Date().toISOString()
  };
}

/** Uma pasta já no formato do explorer (com automação) — resposta de mutações. */
export async function getExplorerFolder(supabase: FilesSupabase, folderId: string): Promise<ExplorerFolder> {
  const [row, automation] = await Promise.all([
    getFolderRowOrThrow(supabase, folderId),
    loadFolderAutomationIndex(supabase)
  ]);
  return toExplorerFolder(row, automation.get(row.id));
}

async function readFileRowsByIds(supabase: FilesSupabase, fileIds: string[]) {
  const ids = Array.from(new Set(fileIds));
  const responses = await Promise.all(
    chunk(ids, ID_CHUNK).map((part) => supabase.from("arquivos_arquivos").select("*").in("id", part))
  );
  const rows: FileRow[] = [];
  for (const { data, error } of responses) {
    if (error) {
      console.error("[FILES_LOOKUP_FAILED]", { error });
      throw new ApiHttpError(500, "FILES_LOOKUP_FAILED", "Falha ao carregar arquivos.");
    }
    rows.push(...(data ?? []));
  }
  return rows;
}

function isStorageObjectMissing(error: unknown) {
  if (!error) return false;
  if (typeof error === "string") return /not (exist|found)/i.test(error);
  if (typeof error !== "object") return false;
  const candidate = error as { message?: string; status?: number; statusCode?: number | string };
  const status = Number(candidate.statusCode ?? candidate.status ?? 0);
  const message = String(candidate.message ?? "").toLowerCase();
  return status === 404 || message.includes("not found") || message.includes("does not exist");
}

async function signOriginals(supabase: FilesSupabase, rows: FileRow[]) {
  const result: Record<string, SignedUrlEntry> = {};
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
        EXPLORER_SIGNED_URL_TTL_SECONDS
      );
    if (error) {
      console.error("[FILES_SIGN_FAILED]", { bucket, error });
      throw new ApiHttpError(500, "FILES_SIGN_FAILED", "Falha ao assinar URLs dos arquivos.");
    }
    const byPath = new Map((data ?? []).map((entry) => [entry.path, entry]));
    for (const row of bucketRows) {
      const entry = byPath.get(row.storage_path);
      const url = entry && !entry.error ? entry.signedUrl : null;
      result[row.id] = { url, missing: !url };
    }
  }

  return result;
}

async function signThumbs(supabase: FilesSupabase, rows: FileRow[]) {
  const result: Record<string, SignedUrlEntry> = {};
  const transformable = rows.filter((row) => TRANSFORMABLE_MIME.has(row.mime_type.toLowerCase()));
  for (const row of rows) {
    if (!transformable.includes(row)) result[row.id] = { url: null, missing: false };
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < transformable.length) {
      const row = transformable[cursor];
      cursor += 1;
      const { data, error } = await supabase.storage
        .from(row.bucket_id || FILES_BUCKET)
        .createSignedUrl(row.storage_path, EXPLORER_SIGNED_URL_TTL_SECONDS, { transform: THUMB_TRANSFORM });
      if (error || !data?.signedUrl) {
        result[row.id] = { url: null, missing: isStorageObjectMissing(error) };
        continue;
      }
      result[row.id] = { url: data.signedUrl, missing: false };
    }
  };

  await Promise.all(Array.from({ length: Math.min(THUMB_SIGN_CONCURRENCY, transformable.length) }, worker));
  return result;
}

/**
 * Assina URLs em lote. Só ids que existem no banco são assinados (nunca um
 * path vindo do cliente). `original` serve para preview e download (o cliente
 * acrescenta `&download=`); `thumb` é a miniatura redimensionada.
 */
export async function signExplorerFileUrls(
  supabase: FilesSupabase,
  fileIds: string[],
  variant: SignedUrlVariant
): Promise<SignUrlsResponse> {
  const rows = await readFileRowsByIds(supabase, fileIds);
  const urls =
    variant === "thumb" && THUMBNAILS_ENABLED ? await signThumbs(supabase, rows) : await signOriginals(supabase, rows);

  for (const fileId of fileIds) {
    if (!urls[fileId]) urls[fileId] = { url: null, missing: true };
  }

  return {
    variant,
    expiresAt: new Date(Date.now() + EXPLORER_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    urls
  };
}

export async function bulkDeleteFiles(input: { supabase: FilesSupabase; actor: ActorContext; fileIds: string[] }) {
  const { supabase, actor } = input;
  const rows = await readFileRowsByIds(supabase, input.fileIds);
  if (rows.length === 0) return { deletedIds: [] as string[] };

  const folderIds = Array.from(new Set(rows.map((row) => row.pasta_id)));
  const impactedPhotoCarIds = await resolvePhotoCarIdsForFolders(supabase, folderIds);

  for (const part of chunk(rows.map((row) => row.id), ID_CHUNK)) {
    const { error } = await supabase.from("arquivos_arquivos").delete().in("id", part);
    if (error) {
      console.error("[FILES_DELETE_FAILED]", { error });
      throw new ApiHttpError(400, "FILES_DELETE_FAILED", "Falha ao excluir arquivos.");
    }
  }

  await deleteStoredObjects(
    supabase,
    rows.map((row) => row.storage_path)
  ).catch((error) => console.error("[FILES_STORAGE_DELETE_FAILED]", { error }));

  await Promise.all(folderIds.map((folderId) => touchFolder(supabase, folderId, actor.userId)));

  await writeAuditLog({
    action: "delete",
    table: "arquivos_arquivos",
    pk: rows.length === 1 ? rows[0].id : folderIds[0],
    actor,
    oldData: rows.length === 1 ? rows[0] : { arquivos: rows.map((row) => ({ id: row.id, nome_arquivo: row.nome_arquivo, pasta_id: row.pasta_id })) },
    details:
      rows.length === 1
        ? `Arquivo ${rows[0].nome_arquivo} removido da pasta ${rows[0].pasta_id}.`
        : `${rows.length} arquivo(s) removidos no gerenciador de arquivos.`,
    emLote: rows.length > 1
  });

  await syncPhotoFlagsForCarIds(supabase, impactedPhotoCarIds);

  return { deletedIds: rows.map((row) => row.id) };
}

export async function bulkMoveFiles(input: {
  supabase: FilesSupabase;
  actor: ActorContext;
  fileIds: string[];
  targetFolderId: string;
}) {
  const { supabase, actor, targetFolderId } = input;
  const target = await getFolderRowOrThrow(supabase, targetFolderId);
  const rows = (await readFileRowsByIds(supabase, input.fileIds)).filter((row) => row.pasta_id !== targetFolderId);
  if (rows.length === 0) return { files: [] as ExplorerFile[] };

  const sourceFolderIds = Array.from(new Set(rows.map((row) => row.pasta_id)));
  const impactedBefore = await resolvePhotoCarIdsForFolders(supabase, [...sourceFolderIds, targetFolderId]);
  const startSort = await getNextFolderFileSortOrder(supabase, targetFolderId);
  // Mantém a ordem pedida pelo cliente (ordem da seleção).
  const order = new Map(input.fileIds.map((id, index) => [id, index]));
  rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));

  const now = new Date().toISOString();
  const results = await Promise.all(
    rows.map((row, index) =>
      supabase
        .from("arquivos_arquivos")
        .update({ pasta_id: targetFolderId, sort_order: startSort + index, updated_at: now })
        .eq("id", row.id)
        .select(FILE_INDEX_COLUMNS)
        .single()
    )
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[FILES_MOVE_FAILED]", { error: failed.error });
    throw new ApiHttpError(400, "FILES_MOVE_FAILED", "Falha ao mover arquivos.");
  }

  await Promise.all(
    [...sourceFolderIds, targetFolderId].map((folderId) => touchFolder(supabase, folderId, actor.userId))
  );

  await writeAuditLog({
    action: "update",
    table: "arquivos_arquivos",
    pk: rows.length === 1 ? rows[0].id : targetFolderId,
    actor,
    oldData: { arquivos: rows.map((row) => ({ id: row.id, pasta_id: row.pasta_id, sort_order: row.sort_order })) },
    newData: { pasta_id: targetFolderId, arquivos: rows.map((row) => row.id) },
    details:
      rows.length === 1
        ? `Arquivo ${rows[0].nome_arquivo} movido da pasta ${rows[0].pasta_id} para ${target.nome}.`
        : `${rows.length} arquivo(s) movidos para a pasta ${target.nome}.`,
    emLote: rows.length > 1
  });

  const impactedAfter = await resolvePhotoCarIdsForFolders(supabase, [...sourceFolderIds, targetFolderId]);
  await syncPhotoFlagsForCarIds(supabase, [...impactedBefore, ...impactedAfter]);

  return {
    files: results
      .map((result) => result.data)
      .filter((row): row is FileIndexRow => Boolean(row))
      .map(toExplorerFile)
  };
}
