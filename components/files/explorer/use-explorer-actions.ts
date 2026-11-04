import { useCallback } from "react";

import {
  createFolder,
  deleteFiles,
  deleteFolder,
  moveFiles,
  renameFile,
  reorderFolderFiles,
  setFolderAutomationPaused,
  updateFolder
} from "@/components/files/api";
import {
  applyIndexFileOrder,
  moveIndexFiles,
  parseEntryKey,
  patchIndexFiles,
  patchIndexFolder,
  removeIndexFiles,
  removeIndexFolderTree,
  upsertIndexFiles,
  upsertIndexFolder,
  type EntryKey,
  type ExplorerEntry,
  type ExplorerModel
} from "@/components/files/explorer/model";
import { signedUrlStore, withDownloadParam } from "@/components/files/explorer/signed-url-store";
import type { useExplorerIndex } from "@/components/files/explorer/use-explorer-index";
import { isFolderLocked } from "@/components/files/explorer/folder-rules";
import { setCarroFotoCapa } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ExplorerFile, ExplorerFolder } from "@/lib/files/explorer-types";

type IndexApi = ReturnType<typeof useExplorerIndex>;
export type Notify = (kind: "info" | "error", text: string) => void;

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function triggerDownload(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Todas as mutações do explorer. A tela muda NA HORA (otimista); a chamada
 * roda por trás e, se falhar, o índice volta ao estado anterior.
 */
export function useExplorerActions(params: {
  auth: RequestAuth;
  model: ExplorerModel | null;
  indexApi: IndexApi;
  notify: Notify;
}) {
  const { auth, model, indexApi, notify } = params;
  const { mutate } = indexApi;

  const createChildFolder = useCallback(
    async (parentId: string | null, name: string) => {
      try {
        const result = await mutate({
          run: () => createFolder(auth, { name, parentFolderId: parentId }),
          apply: (current, response) => upsertIndexFolder(current, response.folder)
        });
        return result.folder;
      } catch (error) {
        notify("error", errorText(error, "Falha ao criar pasta."));
        return null;
      }
    },
    [auth, mutate, notify]
  );

  const renameEntry = useCallback(
    async (entry: ExplorerEntry, name: string) => {
      try {
        if (entry.kind === "file") {
          await mutate({
            optimistic: (current) => patchIndexFiles(current, [entry.id], (file) => ({ ...file, name })),
            run: () => renameFile(auth, entry.id, name),
            apply: (current, response) => upsertIndexFiles(current, [response.file])
          });
        } else {
          await mutate({
            optimistic: (current) =>
              patchIndexFolder(current, entry.id, (folder) => ({
                ...folder,
                name,
                displayName: folder.automationKey ? folder.displayName : name
              })),
            run: () => updateFolder(auth, entry.id, { name }),
            apply: (current, response) => upsertIndexFolder(current, response.folder)
          });
        }
      } catch (error) {
        notify("error", errorText(error, "Falha ao renomear."));
      }
    },
    [auth, mutate, notify]
  );

  const moveEntries = useCallback(
    async (keys: EntryKey[], targetFolderId: string) => {
      if (!model) return;
      const parsed = keys.map(parseEntryKey).filter((entry): entry is { kind: "folder" | "file"; id: string } => Boolean(entry));
      const fileIds = parsed
        .filter((entry) => entry.kind === "file" && model.filesById.get(entry.id)?.folderId !== targetFolderId)
        .map((entry) => entry.id);
      const folders = parsed
        .filter((entry) => entry.kind === "folder")
        .map((entry) => model.foldersById.get(entry.id))
        .filter((folder): folder is ExplorerFolder => Boolean(folder) && folder?.parentId !== targetFolderId);
      const locked = folders.filter(isFolderLocked);
      const movableFolders = folders.filter((folder) => !isFolderLocked(folder) && folder.id !== targetFolderId);

      if (locked.length > 0) notify("error", "Pastas de automação não podem ser movidas manualmente.");
      if (fileIds.length === 0 && movableFolders.length === 0) return;

      try {
        if (fileIds.length > 0) {
          await mutate({
            optimistic: (current) => moveIndexFiles(current, fileIds, targetFolderId),
            run: () => moveFiles(auth, fileIds, targetFolderId),
            apply: (current, response) => upsertIndexFiles(current, response.files)
          });
        }
        for (const folder of movableFolders) {
          await mutate({
            optimistic: (current) => patchIndexFolder(current, folder.id, (entry) => ({ ...entry, parentId: targetFolderId })),
            run: () => updateFolder(auth, folder.id, { parentFolderId: targetFolderId }),
            apply: (current, response) => upsertIndexFolder(current, response.folder)
          });
        }
        const total = fileIds.length + movableFolders.length;
        notify("info", `${total} ${total === 1 ? "item movido" : "itens movidos"}.`);
      } catch (error) {
        notify("error", errorText(error, "Falha ao mover."));
      }
    },
    [auth, model, mutate, notify]
  );

  const deleteEntries = useCallback(
    async (entries: ExplorerEntry[]) => {
      const fileIds = entries.filter((entry) => entry.kind === "file").map((entry) => entry.id);
      const folderIds = entries.filter((entry) => entry.kind === "folder").map((entry) => entry.id);
      try {
        if (fileIds.length > 0) {
          await mutate({
            optimistic: (current) => removeIndexFiles(current, fileIds),
            run: () => deleteFiles(auth, fileIds)
          });
          signedUrlStore.forget(fileIds);
        }
        for (const folderId of folderIds) {
          await mutate({
            optimistic: (current) => removeIndexFolderTree(current, folderId),
            run: () => deleteFolder(auth, folderId),
            apply: (current, response) => removeIndexFiles(current, response.fileIds)
          });
        }
        const total = fileIds.length + folderIds.length;
        notify("info", `${total} ${total === 1 ? "item excluído" : "itens excluídos"}.`);
      } catch (error) {
        notify("error", errorText(error, "Falha ao excluir."));
      }
    },
    [auth, mutate, notify]
  );

  const reorder = useCallback(
    async (folderId: string, orderedIds: string[]) => {
      try {
        await mutate({
          optimistic: (current) => applyIndexFileOrder(current, folderId, orderedIds),
          run: () => reorderFolderFiles(auth, folderId, orderedIds)
        });
      } catch (error) {
        notify("error", errorText(error, "Falha ao reordenar."));
      }
    },
    [auth, mutate, notify]
  );

  const setCover = useCallback(
    async (folder: ExplorerFolder, file: ExplorerFile | null) => {
      const carroId = folder.managedCarroId;
      if (!carroId) return;
      try {
        await mutate({
          optimistic: (current) =>
            patchIndexFolder(current, folder.id, (entry) =>
              entry.vehicle ? { ...entry, vehicle: { ...entry.vehicle, coverFileId: file?.id ?? null } } : entry
            ),
          run: () => setCarroFotoCapa({ requestAuth: auth, carroId, fileId: file?.id ?? null })
        });
        notify("info", file ? "Foto de capa definida." : "Foto de capa removida.");
      } catch (error) {
        notify("error", errorText(error, "Falha ao definir a capa."));
      }
    },
    [auth, mutate, notify]
  );

  const toggleAutomation = useCallback(
    async (folder: ExplorerFolder) => {
      const paused = !folder.isAutomationPaused;
      try {
        await mutate({
          optimistic: (current) => patchIndexFolder(current, folder.id, (entry) => ({ ...entry, isAutomationPaused: paused })),
          run: () => setFolderAutomationPaused(auth, folder.id, paused)
        });
        notify("info", paused ? "Automação pausada: a ficha de documentos fica manual." : "Automação reativada.");
      } catch (error) {
        notify("error", errorText(error, "Falha ao alternar a automação."));
      }
    },
    [auth, mutate, notify]
  );

  const saveDescription = useCallback(
    async (folder: ExplorerFolder, description: string | null) => {
      try {
        await mutate({
          optimistic: (current) => patchIndexFolder(current, folder.id, (entry) => ({ ...entry, description })),
          run: () => updateFolder(auth, folder.id, { description }),
          apply: (current, response) => upsertIndexFolder(current, response.folder)
        });
      } catch (error) {
        notify("error", errorText(error, "Falha ao salvar a descrição."));
      }
    },
    [auth, mutate, notify]
  );

  const downloadFiles = useCallback(
    async (files: ExplorerFile[]) => {
      if (files.length === 0) return;
      await signedUrlStore.ensure(
        files.map((file) => file.id),
        "original"
      );
      let missing = 0;
      for (const [position, file] of files.entries()) {
        const url = signedUrlStore.get(file.id, "original")?.url;
        if (!url) {
          missing += 1;
          continue;
        }
        triggerDownload(withDownloadParam(url, file.name));
        // Navegadores descartam downloads disparados no mesmo instante.
        if (position < files.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (missing > 0) notify("error", `${missing} arquivo(s) indisponível(is) no armazenamento.`);
    },
    [notify]
  );

  return {
    createChildFolder,
    renameEntry,
    moveEntries,
    deleteEntries,
    reorder,
    setCover,
    toggleAutomation,
    saveDescription,
    downloadFiles
  };
}
