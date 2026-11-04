import type { ExplorerFile, ExplorerFolder, ExplorerIndex } from "@/lib/files/explorer-types";

/**
 * Modelo em memória do explorer, derivado do índice. Tudo aqui é puro e
 * síncrono: navegar, listar, contar e buscar não tocam a rede.
 */

export type EntryKey = `d:${string}` | `f:${string}`;

export type FolderEntry = {
  key: `d:${string}`;
  kind: "folder";
  id: string;
  name: string;
  folder: ExplorerFolder;
  modifiedAt: string;
  sizeBytes: null;
  itemCount: number;
};

export type FileEntry = {
  key: `f:${string}`;
  kind: "file";
  id: string;
  name: string;
  file: ExplorerFile;
  modifiedAt: string;
  sizeBytes: number;
};

export type ExplorerEntry = FolderEntry | FileEntry;

export type ExplorerModel = {
  foldersById: Map<string, ExplorerFolder>;
  filesById: Map<string, ExplorerFile>;
  /** Filhas por pai (`null` = raiz), ordenadas pelo nome exibido. */
  childFolderIds: Map<string | null, string[]>;
  /** Arquivos por pasta, na ordem manual (sort_order, created_at). */
  fileIdsByFolder: Map<string, string[]>;
};

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function folderKey(id: string): `d:${string}` {
  return `d:${id}`;
}

export function fileKey(id: string): `f:${string}` {
  return `f:${id}`;
}

export function parseEntryKey(key: string): { kind: "folder" | "file"; id: string } | null {
  if (key.startsWith("d:")) return { kind: "folder", id: key.slice(2) };
  if (key.startsWith("f:")) return { kind: "file", id: key.slice(2) };
  return null;
}

export function folderLabel(folder: Pick<ExplorerFolder, "displayName" | "name"> | null | undefined) {
  return folder?.displayName || folder?.name || "";
}

export function compareFilesByOrder(left: ExplorerFile, right: ExplorerFile) {
  return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function buildExplorerModel(index: ExplorerIndex): ExplorerModel {
  const foldersById = new Map(index.folders.map((folder) => [folder.id, folder]));
  const filesById = new Map(index.files.map((file) => [file.id, file]));
  const childFolderIds = new Map<string | null, string[]>();
  const fileIdsByFolder = new Map<string, string[]>();

  for (const folder of index.folders) {
    // Pai inexistente (dado órfão) vira raiz em vez de sumir.
    const parent = folder.parentId && foldersById.has(folder.parentId) ? folder.parentId : null;
    const bucket = childFolderIds.get(parent);
    if (bucket) bucket.push(folder.id);
    else childFolderIds.set(parent, [folder.id]);
  }
  for (const ids of childFolderIds.values()) {
    ids.sort((left, right) => collator.compare(folderLabel(foldersById.get(left)), folderLabel(foldersById.get(right))));
  }

  const filesByFolder = new Map<string, ExplorerFile[]>();
  for (const file of index.files) {
    const bucket = filesByFolder.get(file.folderId);
    if (bucket) bucket.push(file);
    else filesByFolder.set(file.folderId, [file]);
  }
  for (const [folderId, files] of filesByFolder) {
    files.sort(compareFilesByOrder);
    fileIdsByFolder.set(
      folderId,
      files.map((file) => file.id)
    );
  }

  return { foldersById, filesById, childFolderIds, fileIdsByFolder };
}

export function getChildFolders(model: ExplorerModel, parentId: string | null) {
  return (model.childFolderIds.get(parentId) ?? [])
    .map((id) => model.foldersById.get(id))
    .filter((folder): folder is ExplorerFolder => Boolean(folder));
}

export function getFolderFiles(model: ExplorerModel, folderId: string) {
  return (model.fileIdsByFolder.get(folderId) ?? [])
    .map((id) => model.filesById.get(id))
    .filter((file): file is ExplorerFile => Boolean(file));
}

export function countFolderItems(model: ExplorerModel, folderId: string) {
  return (model.childFolderIds.get(folderId)?.length ?? 0) + (model.fileIdsByFolder.get(folderId)?.length ?? 0);
}

/** Caminho raiz → pasta (inclusive). Tolera ciclos/órfãos. */
export function getFolderPath(model: ExplorerModel, folderId: string | null) {
  const path: ExplorerFolder[] = [];
  const seen = new Set<string>();
  let cursor = folderId ? model.foldersById.get(folderId) : undefined;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parentId ? model.foldersById.get(cursor.parentId) : undefined;
  }
  return path;
}

export function getFolderPathLabel(model: ExplorerModel, folderId: string | null) {
  return getFolderPath(model, folderId).map(folderLabel).join(" / ");
}

export function isSameOrDescendant(model: ExplorerModel, ancestorId: string, folderId: string | null) {
  return getFolderPath(model, folderId).some((folder) => folder.id === ancestorId);
}

export function collectSubtreeFolderIds(model: ExplorerModel, rootId: string) {
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(model.childFolderIds.get(id) ?? []));
  }
  return out;
}

export function toFolderEntry(model: ExplorerModel, folder: ExplorerFolder): FolderEntry {
  return {
    key: folderKey(folder.id),
    kind: "folder",
    id: folder.id,
    name: folderLabel(folder),
    folder,
    modifiedAt: folder.updatedAt,
    sizeBytes: null,
    itemCount: countFolderItems(model, folder.id)
  };
}

export function toFileEntry(file: ExplorerFile): FileEntry {
  return {
    key: fileKey(file.id),
    kind: "file",
    id: file.id,
    name: file.name,
    file,
    modifiedAt: file.updatedAt,
    sizeBytes: file.sizeBytes
  };
}

/** Conteúdo direto de uma pasta (`null` = raiz: só pastas raiz). */
export function listFolderEntries(model: ExplorerModel, folderId: string | null): ExplorerEntry[] {
  const folders = getChildFolders(model, folderId).map((folder) => toFolderEntry(model, folder));
  if (!folderId) return folders;
  return [...folders, ...getFolderFiles(model, folderId).map(toFileEntry)];
}

// ---------------------------------------------------------------- ordenação

export type SortKey = "order" | "name" | "modified" | "type" | "size";
export type SortDirection = "asc" | "desc";

export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

const MIME_FAMILY_LABEL: Array<[RegExp, string]> = [
  [/^image\//, "Imagem"],
  [/^video\//, "Vídeo"],
  [/^audio\//, "Áudio"],
  [/^application\/pdf$/, "Documento PDF"],
  [/^text\//, "Texto"]
];

export function fileTypeLabel(name: string, mimeType: string) {
  const ext = fileExtension(name).toUpperCase();
  const family = MIME_FAMILY_LABEL.find(([pattern]) => pattern.test(mimeType.toLowerCase()))?.[1];
  if (family === "Documento PDF") return family;
  if (family && ext) return `${family} ${ext}`;
  if (family) return family;
  return ext ? `Arquivo ${ext}` : "Arquivo";
}

export function entryTypeLabel(entry: ExplorerEntry) {
  return entry.kind === "folder" ? "Pasta de arquivos" : fileTypeLabel(entry.file.name, entry.file.mimeType);
}

/** Pastas sempre antes de arquivos (como no Explorer); "order" = ordem manual. */
export function sortEntries(entries: ExplorerEntry[], key: SortKey, direction: SortDirection) {
  const factor = direction === "asc" ? 1 : -1;
  const compare = (left: ExplorerEntry, right: ExplorerEntry) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    switch (key) {
      case "order":
        if (left.kind === "file" && right.kind === "file") return compareFilesByOrder(left.file, right.file) * factor;
        return collator.compare(left.name, right.name) * factor;
      case "modified":
        return left.modifiedAt.localeCompare(right.modifiedAt) * factor || collator.compare(left.name, right.name);
      case "type":
        return collator.compare(entryTypeLabel(left), entryTypeLabel(right)) * factor || collator.compare(left.name, right.name);
      case "size": {
        const leftSize = left.kind === "file" ? left.sizeBytes : left.itemCount;
        const rightSize = right.kind === "file" ? right.sizeBytes : right.itemCount;
        return (leftSize - rightSize) * factor || collator.compare(left.name, right.name);
      }
      default:
        return collator.compare(left.name, right.name) * factor;
    }
  };
  return [...entries].sort(compare);
}

// ------------------------------------------------------------------- busca

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function compact(value: string) {
  return value.replace(/[^a-z0-9]/g, "");
}

export type SearchHit = {
  entry: ExplorerEntry;
  /** Caminho da pasta que contém o item ("Fotos dos Veiculos / ABC1D23"). */
  location: string;
  locationFolderId: string | null;
  score: number;
};

type Tokens = Array<{ text: string; compact: string }>;

function tokenize(query: string): Tokens {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, compact: compact(text) }));
}

function matchesAll(tokens: Tokens, haystack: string, haystackCompact: string) {
  return tokens.every(
    (token) => haystack.includes(token.text) || (token.compact.length > 0 && haystackCompact.includes(token.compact))
  );
}

/** Quanto do nome (não do caminho) casa com a busca — define o ranking. */
function nameScore(tokens: Tokens, name: string) {
  const normalized = normalizeSearchText(name);
  const nameCompact = compact(normalized);
  const full = tokens.map((token) => token.text).join(" ");
  const fullCompact = compact(full);
  if (normalized === full || (fullCompact && nameCompact === fullCompact)) return 100;
  if (normalized.startsWith(full) || (fullCompact && nameCompact.startsWith(fullCompact))) return 80;
  const inName = tokens.filter((token) => normalized.includes(token.text) || (token.compact && nameCompact.includes(token.compact))).length;
  return inName === tokens.length ? 60 : inName > 0 ? 30 : 10;
}

/**
 * Busca instantânea no índice inteiro: nome de pastas, caminho e nome de
 * arquivos. Tokens são AND, sem acento/caixa; "abc1d23" acha "ABC-1D23".
 * `scopeFolderId` restringe à subárvore.
 */
export function searchExplorer(
  model: ExplorerModel,
  query: string,
  options: { scopeFolderId?: string | null; limit?: number } = {}
): { hits: SearchHit[]; total: number } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { hits: [], total: 0 };

  const scope = options.scopeFolderId ? new Set(collectSubtreeFolderIds(model, options.scopeFolderId)) : null;
  const pathCache = new Map<string, string>();
  const pathOf = (folderId: string) => {
    const cached = pathCache.get(folderId);
    if (cached !== undefined) return cached;
    const label = getFolderPathLabel(model, folderId);
    pathCache.set(folderId, label);
    return label;
  };

  const hits: SearchHit[] = [];

  for (const folder of model.foldersById.values()) {
    if (scope && (!scope.has(folder.id) || folder.id === options.scopeFolderId)) continue;
    const path = pathOf(folder.id);
    const haystack = normalizeSearchText(`${path} ${folder.name}`);
    if (!matchesAll(tokens, haystack, compact(haystack))) continue;
    const parentId = folder.parentId && model.foldersById.has(folder.parentId) ? folder.parentId : null;
    hits.push({
      entry: toFolderEntry(model, folder),
      location: parentId ? pathOf(parentId) : "",
      locationFolderId: parentId,
      score: nameScore(tokens, folderLabel(folder)) + 5
    });
  }

  for (const file of model.filesById.values()) {
    if (scope && !scope.has(file.folderId)) continue;
    const path = pathOf(file.folderId);
    const haystack = normalizeSearchText(`${path} ${file.name}`);
    if (!matchesAll(tokens, haystack, compact(haystack))) continue;
    hits.push({
      entry: toFileEntry(file),
      location: path,
      locationFolderId: file.folderId,
      score: nameScore(tokens, file.name)
    });
  }

  hits.sort(
    (left, right) =>
      right.score - left.score ||
      (left.entry.kind === right.entry.kind ? 0 : left.entry.kind === "folder" ? -1 : 1) ||
      left.location.length - right.location.length ||
      collator.compare(left.entry.name, right.entry.name)
  );

  return { hits: options.limit ? hits.slice(0, options.limit) : hits, total: hits.length };
}

/** Primeira ocorrência (sem acento/caixa) de algum token no texto exibido. */
export function findHighlightRange(text: string, query: string): [number, number] | null {
  const normalized = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // NFD pode mudar o comprimento; só destacamos quando o mapeamento é 1:1.
  if (normalized.length !== text.length) return null;
  let best: [number, number] | null = null;
  for (const token of tokenize(query)) {
    const at = normalized.indexOf(token.text);
    if (at >= 0 && (!best || token.text.length > best[1] - best[0])) best = [at, at + token.text.length];
  }
  return best;
}

// --------------------------------------------------- mutações do índice

export function upsertIndexFiles(index: ExplorerIndex, files: ExplorerFile[]): ExplorerIndex {
  if (files.length === 0) return index;
  const byId = new Map(files.map((file) => [file.id, file]));
  const kept = index.files.filter((file) => !byId.has(file.id));
  return { ...index, files: [...kept, ...files] };
}

export function removeIndexFiles(index: ExplorerIndex, fileIds: Iterable<string>): ExplorerIndex {
  const ids = new Set(fileIds);
  if (ids.size === 0) return index;
  return { ...index, files: index.files.filter((file) => !ids.has(file.id)) };
}

export function patchIndexFiles(
  index: ExplorerIndex,
  fileIds: Iterable<string>,
  patch: (file: ExplorerFile) => ExplorerFile
): ExplorerIndex {
  const ids = new Set(fileIds);
  return { ...index, files: index.files.map((file) => (ids.has(file.id) ? patch(file) : file)) };
}

export function upsertIndexFolder(index: ExplorerIndex, folder: ExplorerFolder): ExplorerIndex {
  const exists = index.folders.some((entry) => entry.id === folder.id);
  return {
    ...index,
    folders: exists ? index.folders.map((entry) => (entry.id === folder.id ? folder : entry)) : [...index.folders, folder]
  };
}

export function patchIndexFolder(
  index: ExplorerIndex,
  folderId: string,
  patch: (folder: ExplorerFolder) => ExplorerFolder
): ExplorerIndex {
  return { ...index, folders: index.folders.map((folder) => (folder.id === folderId ? patch(folder) : folder)) };
}

/** Remove a pasta, a subárvore e os arquivos dela. */
export function removeIndexFolderTree(index: ExplorerIndex, folderId: string): ExplorerIndex {
  const model = buildExplorerModel(index);
  const ids = new Set(collectSubtreeFolderIds(model, folderId));
  return {
    ...index,
    folders: index.folders.filter((folder) => !ids.has(folder.id)),
    files: index.files.filter((file) => !ids.has(file.folderId))
  };
}

/** Move arquivos para o fim da pasta destino (mesma regra do servidor). */
export function moveIndexFiles(index: ExplorerIndex, fileIds: string[], targetFolderId: string): ExplorerIndex {
  const moving = new Set(fileIds.filter((id) => index.files.some((file) => file.id === id && file.folderId !== targetFolderId)));
  if (moving.size === 0) return index;
  const maxOrder = index.files
    .filter((file) => file.folderId === targetFolderId)
    .reduce((max, file) => Math.max(max, file.sortOrder), -1);
  const position = new Map(fileIds.filter((id) => moving.has(id)).map((id, offset) => [id, maxOrder + 1 + offset]));
  return {
    ...index,
    files: index.files.map((file) =>
      moving.has(file.id) ? { ...file, folderId: targetFolderId, sortOrder: position.get(file.id) ?? file.sortOrder } : file
    )
  };
}

/** Nova ordem manual: move `draggedIds` para antes de `targetId` (ou fim). */
export function reorderFileIds(orderedIds: string[], draggedIds: string[], targetId: string | null) {
  const dragged = new Set(draggedIds);
  const moving = orderedIds.filter((id) => dragged.has(id));
  if (moving.length === 0 || (targetId && dragged.has(targetId))) return orderedIds;
  const rest = orderedIds.filter((id) => !dragged.has(id));
  const at = targetId ? rest.indexOf(targetId) : -1;
  if (at < 0) return [...rest, ...moving];
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

export function applyIndexFileOrder(index: ExplorerIndex, folderId: string, orderedIds: string[]): ExplorerIndex {
  const position = new Map(orderedIds.map((id, order) => [id, order]));
  return {
    ...index,
    files: index.files.map((file) =>
      file.folderId === folderId && position.has(file.id) ? { ...file, sortOrder: position.get(file.id) ?? file.sortOrder } : file
    )
  };
}

/** "Nova pasta", "Nova pasta (2)"... sem colidir com irmãs. */
export function uniqueChildFolderName(model: ExplorerModel, parentId: string | null, base = "Nova pasta") {
  const taken = new Set(getChildFolders(model, parentId).map((folder) => normalizeSearchText(folder.name)));
  if (!taken.has(normalizeSearchText(base))) return base;
  for (let attempt = 2; ; attempt += 1) {
    const candidate = `${base} (${attempt})`;
    if (!taken.has(normalizeSearchText(candidate))) return candidate;
  }
}
