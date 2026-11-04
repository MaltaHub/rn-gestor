import { useCallback, useRef, useState, type DragEvent } from "react";

import {
  isSameOrDescendant,
  parseEntryKey,
  type EntryKey,
  type ExplorerEntry,
  type ExplorerModel
} from "@/components/files/explorer/model";
import { isFolderLocked } from "@/components/files/explorer/folder-rules";

const INTERNAL_TYPE = "application/x-rn-explorer";

function hasOsFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * Arrastar e soltar do explorer:
 * - itens internos sobre uma pasta (lista, árvore ou caminho) = mover;
 * - arquivos sobre arquivo, com ordem manual ativa = reordenar;
 * - arquivos do sistema operacional = enviar para a pasta alvo.
 */
export function useExplorerDnd(params: {
  canManage: boolean;
  model: ExplorerModel | null;
  currentFolderId: string | null;
  reorderEnabled: boolean;
  dragKeysFor: (key: EntryKey) => EntryKey[];
  onMove: (keys: EntryKey[], folderId: string) => void;
  onUpload: (files: File[], folderId: string) => void;
  onReorder: (fileIds: string[], beforeFileId: string | null) => void;
}) {
  const dragKeysRef = useRef<EntryKey[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [reorderTargetId, setReorderTargetId] = useState<string | null>(null);
  const [surfaceActive, setSurfaceActive] = useState(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const reorderTargetIdRef = useRef<string | null>(null);
  reorderTargetIdRef.current = reorderTargetId;

  const canDropInto = useCallback((folderId: string) => {
    const { model } = paramsRef.current;
    if (!model) return false;
    return dragKeysRef.current.some((key) => {
      const parsed = parseEntryKey(key);
      if (!parsed) return false;
      if (parsed.kind === "file") return model.filesById.get(parsed.id)?.folderId !== folderId;
      const folder = model.foldersById.get(parsed.id);
      if (!folder || isFolderLocked(folder) || folder.parentId === folderId) return false;
      return !isSameOrDescendant(model, folder.id, folderId);
    });
  }, []);

  const endDrag = useCallback(() => {
    dragKeysRef.current = [];
    setDropTargetId(null);
    setReorderTargetId(null);
    setSurfaceActive(false);
  }, []);

  const entryDragProps = useCallback(
    (entry: ExplorerEntry) => ({
      draggable: params.canManage,
      onDragStart: (event: DragEvent) => {
        if (!paramsRef.current.canManage) return;
        dragKeysRef.current = paramsRef.current.dragKeysFor(entry.key);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(INTERNAL_TYPE, dragKeysRef.current.join(","));
        event.dataTransfer.setData("text/plain", entry.name);
      },
      onDragEnd: endDrag
    }),
    [endDrag, params.canManage]
  );

  const folderDropProps = useCallback(
    (folderId: string) => ({
      onDragOver: (event: DragEvent) => {
        if (!paramsRef.current.canManage) return;
        const internal = dragKeysRef.current.length > 0;
        if (internal ? !canDropInto(folderId) : !hasOsFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = internal ? "move" : "copy";
        setDropTargetId(folderId);
        setReorderTargetId(null);
      },
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropTargetId((current) => (current === folderId ? null : current));
      },
      onDrop: (event: DragEvent) => {
        if (!paramsRef.current.canManage) return;
        event.preventDefault();
        event.stopPropagation();
        const keys = dragKeysRef.current;
        endDrag();
        if (keys.length > 0) {
          paramsRef.current.onMove(keys, folderId);
          return;
        }
        if (event.dataTransfer.files.length > 0) paramsRef.current.onUpload(Array.from(event.dataTransfer.files), folderId);
      }
    }),
    [canDropInto, endDrag]
  );

  const fileReorderProps = useCallback(
    (fileId: string) => ({
      onDragOver: (event: DragEvent) => {
        const { canManage, reorderEnabled, model, currentFolderId } = paramsRef.current;
        if (!canManage || !reorderEnabled || !model || dragKeysRef.current.length === 0) return;
        const allLocalFiles = dragKeysRef.current.every((key) => {
          const parsed = parseEntryKey(key);
          return parsed?.kind === "file" && model.filesById.get(parsed.id)?.folderId === currentFolderId;
        });
        if (!allLocalFiles) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setReorderTargetId(fileId);
        setDropTargetId(null);
      },
      onDrop: (event: DragEvent) => {
        if (!reorderTargetIdRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const ids = dragKeysRef.current
          .map((key) => parseEntryKey(key))
          .filter((parsed) => parsed?.kind === "file")
          .map((parsed) => parsed?.id ?? "");
        endDrag();
        paramsRef.current.onReorder(ids, fileId);
      }
    }),
    [endDrag]
  );
  /** Fundo da lista: arquivos do SO sobem para a pasta atual. */
  const surfaceDropProps = {
    onDragOver: (event: DragEvent) => {
      const { canManage, currentFolderId } = paramsRef.current;
      if (!canManage || !currentFolderId) return;
      if (dragKeysRef.current.length > 0) {
        // Itens vindos da busca (outras pastas) podem ser soltos na pasta atual.
        if (!canDropInto(currentFolderId)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        return;
      }
      if (!hasOsFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setSurfaceActive(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setSurfaceActive(false);
    },
    onDrop: (event: DragEvent) => {
      const { canManage, currentFolderId } = paramsRef.current;
      if (!canManage || !currentFolderId) return;
      event.preventDefault();
      const keys = dragKeysRef.current;
      endDrag();
      if (keys.length > 0) {
        paramsRef.current.onMove(keys, currentFolderId);
        return;
      }
      if (event.dataTransfer.files.length > 0) paramsRef.current.onUpload(Array.from(event.dataTransfer.files), currentFolderId);
    }
  };

  return { dropTargetId, reorderTargetId, surfaceActive, entryDragProps, folderDropProps, fileReorderProps, surfaceDropProps };
}

export type ExplorerDnd = ReturnType<typeof useExplorerDnd>;
