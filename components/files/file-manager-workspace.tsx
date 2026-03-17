"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFileFolder,
  deleteFileFolder,
  deleteFolderFile,
  fetchFileFolderDetail,
  fetchFileFolders,
  renameFolderFile,
  reorderFolderFiles,
  updateFileFolder,
  uploadFolderFiles
} from "@/components/files/api";
import type { FileFolderDetail, FileFolderSummary, FileItem } from "@/components/files/types";
import type { CurrentActor, Role } from "@/components/ui-grid/types";
import { formatBytes, getFilePreviewKind, type FilePreviewKind, isPreviewableFile } from "@/lib/files/shared";

type FileManagerWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type PendingUploadItem = {
  id: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string | null;
  createdAt: string;
  status: "queued" | "uploading";
};

type PendingUploadBatch = {
  id: string;
  folderId: string;
  files: File[];
  pendingIds: string[];
};

type CreatePanelState =
  | null
  | {
      parentFolderId: string | null;
    };

type FolderTreeNode = FileFolderSummary & {
  children: FolderTreeNode[];
};

type ViewMode = "compact" | "medium" | "large";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function reorderFiles(files: FileItem[], draggedId: string, targetId: string) {
  const sourceIndex = files.findIndex((file) => file.id === draggedId);
  const targetIndex = files.findIndex((file) => file.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return files;
  }

  const next = [...files];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((file, index) => ({
    ...file,
    sortOrder: index
  }));
}

function buildFolderTree(folders: FileFolderSummary[]) {
  const nodeById = new Map<string, FolderTreeNode>();

  for (const folder of folders) {
    nodeById.set(folder.id, {
      ...folder,
      children: []
    });
  }

  const roots: FolderTreeNode[] = [];
  for (const folder of folders) {
    const node = nodeById.get(folder.id);
    if (!node) continue;

    if (folder.parentFolderId && nodeById.has(folder.parentFolderId)) {
      nodeById.get(folder.parentFolderId)?.children.push(node);
      continue;
    }

    roots.push(node);
  }

  function sortNodes(nodes: FolderTreeNode[]) {
    nodes.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  }

  sortNodes(roots);
  return roots;
}

function flattenFolderOptions(nodes: FolderTreeNode[], level = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: `${"  ".repeat(level)}${node.name}`
    },
    ...flattenFolderOptions(node.children, level + 1)
  ]);
}

function getAncestorIds(folders: FileFolderSummary[], folderId: string | null) {
  if (!folderId) return [];

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors: string[] = [];
  let cursor = folderById.get(folderId) ?? null;

  while (cursor?.parentFolderId) {
    ancestors.push(cursor.parentFolderId);
    cursor = folderById.get(cursor.parentFolderId) ?? null;
  }

  return ancestors;
}

function getPreviewLabel(kind: FilePreviewKind) {
  switch (kind) {
    case "image":
      return "IMG";
    case "pdf":
      return "PDF";
    case "video":
      return "VIDEO";
    case "audio":
      return "AUDIO";
    case "text":
      return "TXT";
    default:
      return "ARQ";
  }
}

async function downloadBlobFromUrl(url: string, filename: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Falha ao baixar arquivo.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function FileManagerWorkspace({ actor, accessToken, devRole, onSignOut }: FileManagerWorkspaceProps) {
  const canManage = actor.role === "ADMINISTRADOR";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeFolderIdRef = useRef<string | null>(null);
  const uploadQueueRef = useRef<PendingUploadBatch[]>([]);
  const pendingUploadsRef = useRef<PendingUploadItem[]>([]);
  const uploadProcessingRef = useRef(false);

  const [folders, setFolders] = useState<FileFolderSummary[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FileFolderDetail | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [folderLoading, setFolderLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadAllPending, setDownloadAllPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [createPanel, setCreatePanel] = useState<CreatePanelState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createParentFolderId, setCreateParentFolderId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editParentFolderId, setEditParentFolderId] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("medium");
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([]);
  const [queuedUploadsCount, setQueuedUploadsCount] = useState(0);

  const uploadBusy = pendingUploads.length > 0 || queuedUploadsCount > 0;
  const folderTree = buildFolderTree(folders);
  const folderOptions = flattenFolderOptions(folderTree);
  const expandedFolderIdSet = new Set(expandedFolderIds);
  const activePendingUploads = pendingUploads.filter((item) => item.folderId === activeFolderId);
  const filteredFiles = useMemo(
    () =>
      activeFolder
        ? activeFolder.files.filter((file) => file.fileName.toLowerCase().includes(fileQuery.trim().toLowerCase()))
        : [],
    [activeFolder, fileQuery]
  );
  const selectedFile = filteredFiles.find((file) => file.id === selectedFileId) ?? filteredFiles[0] ?? null;
  const selectedPreviewKind = getFilePreviewKind(selectedFile?.mimeType, selectedFile?.fileName);

  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
  }, [activeFolderId]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!activeFolder) {
      setEditName("");
      setEditDescription("");
      setEditParentFolderId("");
      setSettingsOpen(false);
      return;
    }

    setEditName(activeFolder.folder.name);
    setEditDescription(activeFolder.folder.description ?? "");
    setEditParentFolderId(activeFolder.folder.parentFolderId ?? "");
    setSettingsOpen(false);
  }, [activeFolder]);

  useEffect(() => {
    if (folders.length === 0) return;

    setExpandedFolderIds((current) => {
      const next = new Set(current);
      for (const folder of folders) {
        if (!folder.parentFolderId) {
          next.add(folder.id);
        }
      }

      for (const folderId of getAncestorIds(folders, activeFolderId)) {
        next.add(folderId);
      }

      return Array.from(next);
    });
  }, [folders, activeFolderId]);

  useEffect(() => {
    if (!selectedFileId || !filteredFiles.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(filteredFiles[0]?.id ?? null);
    }
  }, [filteredFiles, selectedFileId]);

  useEffect(() => {
    if (!selectedFile || selectedPreviewKind !== "text" || !selectedFile.previewUrl) {
      setPreviewText("");
      setPreviewLoading(false);
      return;
    }

    let active = true;
    setPreviewLoading(true);

    fetch(selectedFile.previewUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Falha ao carregar preview de texto.");
        }
        return response.text();
      })
      .then((text) => {
        if (!active) return;
        setPreviewText(text.slice(0, 12000));
      })
      .catch(() => {
        if (!active) return;
        setPreviewText("Nao foi possivel gerar preview textual deste arquivo.");
      })
      .finally(() => {
        if (!active) return;
        setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedFile, selectedPreviewKind]);

  const loadFolders = useCallback(async (preferredFolderId?: string | null) => {
    setFoldersLoading(true);
    setError(null);

    try {
      const response = await fetchFileFolders({ accessToken, devRole });
      const nextFolders = response.folders;

      setFolders(nextFolders);
      setActiveFolderId((current) => {
        const preferred = preferredFolderId ?? current;
        if (preferred && nextFolders.some((folder) => folder.id === preferred)) {
          return preferred;
        }

        return nextFolders[0]?.id ?? null;
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao carregar pastas.");
    } finally {
      setFoldersLoading(false);
    }
  }, [accessToken, devRole]);

  const loadActiveFolder = useCallback(async (folderId: string) => {
    setFolderLoading(true);
    setError(null);

    try {
      const detail = await fetchFileFolderDetail(folderId, { accessToken, devRole });
      setActiveFolder(detail);
    } catch (nextError) {
      setActiveFolder(null);
      setError(nextError instanceof Error ? nextError.message : "Falha ao carregar a pasta selecionada.");
    } finally {
      setFolderLoading(false);
    }
  }, [accessToken, devRole]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (!activeFolderId) {
      setActiveFolder(null);
      return;
    }

    void loadActiveFolder(activeFolderId);
  }, [activeFolderId, loadActiveFolder]);

  const removePendingUploads = useCallback((pendingIds: string[]) => {
    const pendingIdSet = new Set(pendingIds);

    setPendingUploads((current) => {
      const next: PendingUploadItem[] = [];

      for (const item of current) {
        if (pendingIdSet.has(item.id)) {
          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
          continue;
        }

        next.push(item);
      }

      return next;
    });
  }, []);

  const updatePendingUploadStatus = useCallback((pendingIds: string[], status: PendingUploadItem["status"]) => {
    const pendingIdSet = new Set(pendingIds);
    setPendingUploads((current) =>
      current.map((item) => (pendingIdSet.has(item.id) ? { ...item, status } : item))
    );
  }, []);

  const processUploadQueue = useCallback(async () => {
    if (uploadProcessingRef.current) return;

    uploadProcessingRef.current = true;

    while (uploadQueueRef.current.length > 0) {
      const batch = uploadQueueRef.current[0];
      if (!batch) break;

      setQueuedUploadsCount(uploadQueueRef.current.length);
      updatePendingUploadStatus(batch.pendingIds, "uploading");
      setError(null);

      try {
        await uploadFolderFiles(batch.folderId, batch.files, { accessToken, devRole });
        await loadFolders(batch.folderId);

        if (activeFolderIdRef.current === batch.folderId) {
          await loadActiveFolder(batch.folderId);
        }

        setInfo(`${batch.files.length} arquivo(s) enviado(s) com sucesso.`);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Falha ao enviar arquivos.");
      } finally {
        uploadQueueRef.current.shift();
        setQueuedUploadsCount(uploadQueueRef.current.length);
        removePendingUploads(batch.pendingIds);
      }
    }

    uploadProcessingRef.current = false;
  }, [accessToken, devRole, loadActiveFolder, loadFolders, removePendingUploads, updatePendingUploadStatus]);

  function toggleExpandedFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return Array.from(next);
    });
  }

  function openCreatePanel(parentFolderId: string | null) {
    setCreatePanel({ parentFolderId });
    setCreateName("");
    setCreateDescription("");
    setCreateParentFolderId(parentFolderId ?? "");
    setInfo(null);
    setError(null);
  }

  function closeCreatePanel() {
    setCreatePanel(null);
    setCreateName("");
    setCreateDescription("");
    setCreateParentFolderId("");
  }

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || submitting) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const response = await createFileFolder(
        {
          name: createName,
          description: createDescription || null,
          parentFolderId: createParentFolderId || null
        },
        { accessToken, devRole }
      );

      closeCreatePanel();
      await loadFolders(response.folder.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao criar pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !activeFolder || submitting) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const detail = await updateFileFolder(
        activeFolder.folder.id,
        {
          name: editName,
          description: editDescription || null,
          parentFolderId: editParentFolderId || null
        },
        { accessToken, devRole }
      );

      setActiveFolder(detail);
      setSettingsOpen(false);
      await loadFolders(detail.folder.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao atualizar pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolder() {
    if (!canManage || !activeFolder || submitting || uploadBusy) return;

    const confirmed = window.confirm(`Excluir a pasta "${activeFolder.folder.name}" com toda a arvore e os arquivos?`);
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const deletedFolderId = activeFolder.folder.id;
      const fallbackFolderId = activeFolder.folder.parentFolderId;
      await deleteFileFolder(deletedFolderId, { accessToken, devRole });
      setActiveFolder(null);
      setActiveFolderId(null);
      setSettingsOpen(false);
      await loadFolders(fallbackFolderId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao excluir pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(filesLike: FileList | File[], folderId: string) {
    if (!canManage) return;

    const files = Array.from(filesLike);
    if (files.length === 0) {
      setError("Selecione ao menos um arquivo.");
      return;
    }

    setError(null);
    setInfo(null);
    setFolderDropTargetId(null);
    setActiveFolderId(folderId);

    const createdAt = new Date().toISOString();
    const pendingItems: PendingUploadItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      folderId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      previewUrl: isPreviewableFile(file.type, file.name) ? URL.createObjectURL(file) : null,
      createdAt,
      status: "queued"
    }));

    setPendingUploads((current) => [...pendingItems, ...current]);
    uploadQueueRef.current.push({
      id: crypto.randomUUID(),
      folderId,
      files,
      pendingIds: pendingItems.map((item) => item.id)
    });
    setQueuedUploadsCount(uploadQueueRef.current.length);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    void processUploadQueue();
  }

  async function handleDeleteFile(fileId: string) {
    if (!canManage || !activeFolder || submitting) return;

    const file = activeFolder.files.find((entry) => entry.id === fileId);
    if (!file) return;

    const confirmed = window.confirm(`Excluir o arquivo "${file.fileName}"?`);
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      await deleteFolderFile(fileId, { accessToken, devRole });
      await loadActiveFolder(activeFolder.folder.id);
      await loadFolders(activeFolder.folder.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao excluir arquivo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRenameFile(event: FormEvent<HTMLFormElement>, fileId: string) {
    event.preventDefault();
    if (!canManage || !activeFolder || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const detail = await renameFolderFile(
        fileId,
        {
          fileName: renameFileName
        },
        { accessToken, devRole }
      );

      setActiveFolder(detail);
      setRenamingFileId(null);
      setRenameFileName("");
      await loadFolders(detail.folder.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao renomear arquivo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadFile(file: FileItem) {
    setError(null);

    if (!file.downloadUrl) {
      setError("Este arquivo esta com o objeto ausente no bucket.");
      return;
    }

    try {
      await downloadBlobFromUrl(file.downloadUrl, file.fileName);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao baixar arquivo.");
    }
  }

  async function handleDownloadAll() {
    if (!activeFolder || activeFolder.files.length === 0 || downloadAllPending) return;

    setDownloadAllPending(true);
    setError(null);

    try {
      for (const file of activeFolder.files) {
        if (!file.downloadUrl) continue;
        await downloadBlobFromUrl(file.downloadUrl, file.fileName);
        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao baixar a pasta.");
    } finally {
      setDownloadAllPending(false);
    }
  }

  async function handleDropReorder(targetFileId: string) {
    if (!canManage || !activeFolder || !draggedFileId || draggedFileId === targetFileId) {
      return;
    }

    const nextFiles = reorderFiles(activeFolder.files, draggedFileId, targetFileId);
    setDraggedFileId(null);
    setActiveFolder({
      ...activeFolder,
      files: nextFiles
    });

    try {
      const detail = await reorderFolderFiles(
        activeFolder.folder.id,
        nextFiles.map((file) => file.id),
        { accessToken, devRole }
      );

      setActiveFolder(detail);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao reordenar arquivos.");
      await loadActiveFolder(activeFolder.folder.id);
    }
  }

  function handleUploadInputChange(event: ChangeEvent<HTMLInputElement>) {
    const folderId = activeFolder?.folder.id;
    const files = event.target.files;
    if (!folderId || !files?.length) return;
    void handleUpload(files, folderId);
  }

  function handleFolderFileDrop(folderId: string, event: DragEvent<HTMLButtonElement>) {
    if (!canManage) return;

    event.preventDefault();
    setFolderDropTargetId(null);

    if (event.dataTransfer.files.length > 0) {
      setActiveFolderId(folderId);
      void handleUpload(event.dataTransfer.files, folderId);
    }
  }

  function renderFolderTree(nodes: FolderTreeNode[], level = 0): ReactNode {
    return nodes.map((node) => {
      const expanded = expandedFolderIdSet.has(node.id);
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.id} className="files-tree-node">
          <div className={`files-tree-row ${node.id === activeFolderId ? "is-active" : ""}`}>
            <button
              type="button"
              className="files-tree-toggle"
              onClick={() => {
                if (hasChildren) toggleExpandedFolder(node.id);
              }}
              disabled={!hasChildren}
              aria-label={expanded ? "Recolher pasta" : "Expandir pasta"}
            >
              {hasChildren ? (expanded ? "-" : "+") : "."}
            </button>
            <button
              type="button"
              className={`files-tree-folder ${folderDropTargetId === node.id ? "is-upload-target" : ""}`}
              style={{ paddingLeft: `${12 + level * 14}px` }}
              onClick={() => setActiveFolderId(node.id)}
              onDragOver={(event) => {
                if (!canManage || !Array.from(event.dataTransfer.types).includes("Files")) return;
                event.preventDefault();
                setFolderDropTargetId(node.id);
              }}
              onDragLeave={() => {
                if (folderDropTargetId === node.id) setFolderDropTargetId(null);
              }}
              onDrop={(event) => handleFolderFileDrop(node.id, event)}
            >
              <span className="files-tree-folder-main">
                <strong>{node.name}</strong>
                <small>{node.fileCount}</small>
              </span>
            </button>
          </div>
          {hasChildren && expanded ? <div className="files-tree-children">{renderFolderTree(node.children, level + 1)}</div> : null}
        </div>
      );
    });
  }

  function renderFileThumbnail(
    file: {
      fileName: string;
      mimeType: string;
      previewUrl: string | null;
      isMissing?: boolean;
    },
    variant: "small" | "large"
  ) {
    const kind = getFilePreviewKind(file.mimeType, file.fileName);

    if (file.previewUrl && kind === "image") {
      return (
        <div className={`files-thumb files-thumb-${variant}`}>
          <Image src={file.previewUrl} alt={file.fileName} fill unoptimized sizes={variant === "large" ? "320px" : "72px"} />
        </div>
      );
    }

    return (
      <div className={`files-thumb files-thumb-${variant} files-thumb-fallback`}>
        <strong>{file.isMissing ? "OFF" : getPreviewLabel(kind)}</strong>
      </div>
    );
  }

  function renderPreviewStage() {
    if (!selectedFile) {
      return <div className="files-preview-empty">Selecione um arquivo.</div>;
    }

    if (!selectedFile.previewUrl || selectedFile.isMissing) {
      return <div className="files-preview-empty">Preview indisponivel para este arquivo.</div>;
    }

    switch (selectedPreviewKind) {
      case "image":
        return (
          <div className="files-preview-visual">
            <Image src={selectedFile.previewUrl} alt={selectedFile.fileName} fill unoptimized sizes="640px" />
          </div>
        );
      case "pdf":
        return <iframe className="files-preview-frame" title={selectedFile.fileName} src={selectedFile.previewUrl} />;
      case "video":
        return <video className="files-preview-media" src={selectedFile.previewUrl} controls preload="metadata" />;
      case "audio":
        return (
          <div className="files-preview-audio">
            <audio src={selectedFile.previewUrl} controls preload="metadata" />
          </div>
        );
      case "text":
        return (
          <pre className="files-preview-text">{previewLoading ? "Carregando..." : previewText || "Preview textual vazio."}</pre>
        );
      default:
        return <div className="files-preview-empty">Sem preview inline para este tipo.</div>;
    }
  }

  function renderCompactItem(file: FileItem) {
    return (
      <article
        key={file.id}
        className={`files-compact-item ${selectedFileId === file.id ? "is-selected" : ""}`}
        draggable={canManage}
        onClick={() => setSelectedFileId(file.id)}
        onDragStart={() => setDraggedFileId(file.id)}
        onDragEnd={() => setDraggedFileId(null)}
        onDragOver={(event) => {
          if (!canManage) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void handleDropReorder(file.id);
        }}
      >
        {renderFileThumbnail(file, "small")}
        <strong title={file.fileName}>{file.fileName}</strong>
      </article>
    );
  }

  function renderMediumItem(file: FileItem) {
    return (
      <article
        key={file.id}
        className={`files-list-row ${selectedFileId === file.id ? "is-selected" : ""}`}
        draggable={canManage}
        onClick={() => setSelectedFileId(file.id)}
        onDragStart={() => setDraggedFileId(file.id)}
        onDragEnd={() => setDraggedFileId(null)}
        onDragOver={(event) => {
          if (!canManage) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void handleDropReorder(file.id);
        }}
      >
        {renderFileThumbnail(file, "small")}
        <div className="files-list-main">
          {renamingFileId === file.id ? (
            <form className="files-rename-form" onSubmit={(event) => void handleRenameFile(event, file.id)}>
              <input value={renameFileName} onChange={(event) => setRenameFileName(event.target.value)} />
              <div className="files-list-actions">
                <button type="submit" className="btn" disabled={submitting}>
                  Salvar
                </button>
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={() => {
                    setRenamingFileId(null);
                    setRenameFileName("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              <strong title={file.fileName}>{file.fileName}</strong>
              <div className="files-list-meta">
                <span>{formatBytes(file.sizeBytes)}</span>
                <span>{file.mimeType || "application/octet-stream"}</span>
                <span>#{file.sortOrder + 1}</span>
                <span>{formatDateTime(file.updatedAt)}</span>
              </div>
            </>
          )}
        </div>
        <div className="files-list-actions">
          <button type="button" className="files-ghost-btn" onClick={() => void handleDownloadFile(file)} disabled={!file.downloadUrl}>
            Baixar
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                className="files-ghost-btn"
                onClick={() => {
                  setRenamingFileId(file.id);
                  setRenameFileName(file.fileName);
                }}
              >
                Nome
              </button>
              <button type="button" className="files-danger-btn" onClick={() => void handleDeleteFile(file.id)}>
                Excluir
              </button>
            </>
          ) : null}
        </div>
      </article>
    );
  }

  function renderLargeItem(file: FileItem) {
    return (
      <article
        key={file.id}
        className={`files-large-item ${selectedFileId === file.id ? "is-selected" : ""}`}
        draggable={canManage}
        onClick={() => setSelectedFileId(file.id)}
        onDragStart={() => setDraggedFileId(file.id)}
        onDragEnd={() => setDraggedFileId(null)}
        onDragOver={(event) => {
          if (!canManage) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void handleDropReorder(file.id);
        }}
      >
        {renderFileThumbnail(file, "large")}
        <div className="files-large-main">
          <strong title={file.fileName}>{file.fileName}</strong>
          <div className="files-large-meta">
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>{file.mimeType || "application/octet-stream"}</span>
            <span>Posicao {file.sortOrder + 1}</span>
            <span>Atualizado em {formatDateTime(file.updatedAt)}</span>
          </div>
          <div className="files-list-actions">
            <button type="button" className="files-ghost-btn" onClick={() => setSelectedFileId(file.id)}>
              Preview
            </button>
            <button type="button" className="files-ghost-btn" onClick={() => void handleDownloadFile(file)} disabled={!file.downloadUrl}>
              Baixar
            </button>
            {canManage ? (
              <>
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={() => {
                    setRenamingFileId(file.id);
                    setRenameFileName(file.fileName);
                    setViewMode("medium");
                  }}
                >
                  Renomear
                </button>
                <button type="button" className="files-danger-btn" onClick={() => void handleDeleteFile(file.id)}>
                  Excluir
                </button>
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <main className="files-shell">
      <div className="files-layout files-layout-compact">
        <aside className="files-sidebar files-sidebar-compact">
          <div className="files-nav-row">
            <Link href="/" className="files-nav-link">
              Operacional
            </Link>
            <Link href="/arquivos" className="files-nav-link is-active">
              Arquivos
            </Link>
            <Link href="/perfil" className="files-nav-link">
              Perfil
            </Link>
            {canManage ? (
              <Link href="/admin/usuarios" className="files-nav-link">
                Usuarios
              </Link>
            ) : null}
          </div>

          <div className="files-sidebar-toolbar">
            {canManage ? (
              <>
                <button type="button" className="btn" onClick={() => openCreatePanel(activeFolder?.folder.id ?? null)}>
                  Nova pasta
                </button>
                {activeFolder ? (
                  <button type="button" className="files-ghost-btn" onClick={() => setSettingsOpen((current) => !current)}>
                    Pasta
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" className="files-ghost-btn" onClick={() => void loadFolders(activeFolderId)} disabled={foldersLoading}>
              Atualizar
            </button>
          </div>

          {createPanel ? (
            <form className="files-action-panel" onSubmit={handleCreateFolder}>
              <div className="files-panel-head">
                <strong>{createPanel.parentFolderId ? "Nova subpasta" : "Nova pasta"}</strong>
                <button type="button" className="files-ghost-btn" onClick={closeCreatePanel}>
                  Fechar
                </button>
              </div>
              <select value={createParentFolderId} onChange={(event) => setCreateParentFolderId(event.target.value)}>
                <option value="">Sem pasta pai</option>
                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input className="input" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Nome" />
              <textarea value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} rows={3} placeholder="Descricao" />
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Salvando..." : "Criar"}
              </button>
            </form>
          ) : null}

          {settingsOpen && canManage && activeFolder ? (
            <form className="files-action-panel" onSubmit={handleUpdateFolder}>
              <div className="files-panel-head">
                <strong>Pasta</strong>
                <button type="button" className="files-danger-btn" onClick={() => void handleDeleteFolder()} disabled={submitting || uploadBusy}>
                  Excluir
                </button>
              </div>
              <select value={editParentFolderId} onChange={(event) => setEditParentFolderId(event.target.value)}>
                <option value="">Sem pasta pai</option>
                {folderOptions
                  .filter((option) => option.id !== activeFolder.folder.id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
              <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nome" />
              <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={3} placeholder="Descricao" />
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </button>
            </form>
          ) : null}

          <section className="files-folders-panel">
            <div className="files-folder-list files-folder-tree-list">
              {foldersLoading ? <p className="files-inline-note">Carregando...</p> : null}
              {!foldersLoading && folders.length === 0 ? <p className="files-inline-note">Sem pastas.</p> : null}
              {renderFolderTree(folderTree)}
            </div>
          </section>
        </aside>

        <section className="files-main">
          <header className="files-dashboard-bar">
            <div className="files-dashboard-head">
              {activeFolder ? (
                <div className="files-path">
                  {activeFolder.breadcrumb.map((folder, index) => (
                    <span key={folder.id}>
                      <button type="button" className="files-path-link" onClick={() => setActiveFolderId(folder.id)}>
                        {folder.name}
                      </button>
                      {index < activeFolder.breadcrumb.length - 1 ? " / " : ""}
                    </span>
                  ))}
                </div>
              ) : null}
              <h1>{activeFolder?.folder.name ?? "Arquivos"}</h1>
              {activeFolder ? (
                <p className="files-meta-line">
                  {activeFolder.files.length} arquivo(s) • {activeFolder.childFolders.length} pasta(s)
                </p>
              ) : null}
            </div>

            <div className="files-dashboard-actions">
              {canManage && activeFolder ? (
                <>
                  <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                    Upload
                  </button>
                  <button type="button" className="files-ghost-btn" onClick={() => openCreatePanel(activeFolder.folder.id)}>
                    Subpasta
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="files-ghost-btn"
                onClick={() => void handleDownloadAll()}
                disabled={!activeFolder || activeFolder.files.length === 0 || downloadAllPending}
              >
                {downloadAllPending ? "Baixando..." : "Baixar pasta"}
              </button>
              <button type="button" className="files-ghost-btn" onClick={() => void onSignOut()}>
                Sair
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleUploadInputChange} />
            </div>
          </header>

          {error ? <p className="files-feedback is-error">{error}</p> : null}
          {info ? <p className="files-feedback is-info">{info}</p> : null}

          {!activeFolder && !folderLoading ? (
            <section className="files-empty-state">
              <strong>Selecione uma pasta.</strong>
            </section>
          ) : null}

          {activeFolder ? (
            <>
              {activeFolder.childFolders.length > 0 ? (
                <section className="files-subfolders-strip">
                  {activeFolder.childFolders.map((folder) => (
                    <button key={folder.id} type="button" className="files-subfolder-chip" onClick={() => setActiveFolderId(folder.id)}>
                      {folder.name}
                    </button>
                  ))}
                </section>
              ) : null}

              <section className="files-main-toolbar">
                <input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Buscar arquivo..." />
                <div className="files-view-modes">
                  <button type="button" className={viewMode === "compact" ? "is-active" : ""} onClick={() => setViewMode("compact")}>
                    Compacto
                  </button>
                  <button type="button" className={viewMode === "medium" ? "is-active" : ""} onClick={() => setViewMode("medium")}>
                    Medio
                  </button>
                  <button type="button" className={viewMode === "large" ? "is-active" : ""} onClick={() => setViewMode("large")}>
                    Grande
                  </button>
                </div>
              </section>

              <section className="files-preview-panel">
                <div className="files-preview-stage">{renderPreviewStage()}</div>
                <div className="files-preview-side">
                  {selectedFile ? (
                    <>
                      <strong title={selectedFile.fileName}>{selectedFile.fileName}</strong>
                      <div className="files-list-meta">
                        <span>{formatBytes(selectedFile.sizeBytes)}</span>
                        <span>{selectedFile.mimeType || "application/octet-stream"}</span>
                        <span>{formatDateTime(selectedFile.updatedAt)}</span>
                      </div>
                      <div className="files-list-actions">
                        <button
                          type="button"
                          className="files-ghost-btn"
                          onClick={() => void handleDownloadFile(selectedFile)}
                          disabled={!selectedFile.downloadUrl}
                        >
                          Baixar
                        </button>
                        {canManage ? (
                          <button
                            type="button"
                            className="files-ghost-btn"
                            onClick={() => {
                              setRenamingFileId(selectedFile.id);
                              setRenameFileName(selectedFile.fileName);
                              setViewMode("medium");
                            }}
                          >
                            Renomear
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <span className="files-inline-note">Sem arquivo selecionado.</span>
                  )}
                </div>
              </section>

              <section className="files-list-panel">
                {folderLoading ? <p className="files-inline-note">Carregando...</p> : null}
                {!folderLoading && filteredFiles.length === 0 && activePendingUploads.length === 0 ? (
                  <p className="files-inline-note">{fileQuery ? "Nada encontrado." : "Sem arquivos nesta pasta."}</p>
                ) : null}

                {viewMode === "compact" ? (
                  <div className="files-compact-grid">
                    {filteredFiles.map((file) => renderCompactItem(file))}
                  </div>
                ) : null}

                {viewMode === "medium" ? (
                  <div className="files-list-stack">
                    {activePendingUploads.map((file) => (
                      <article key={file.id} className="files-list-row is-pending">
                        {renderFileThumbnail(file, "small")}
                        <div className="files-list-main">
                          <strong title={file.fileName}>{file.fileName}</strong>
                          <div className="files-list-meta">
                            <span>{formatBytes(file.sizeBytes)}</span>
                            <span>{file.mimeType || "application/octet-stream"}</span>
                            <span>{file.status}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                    {filteredFiles.map((file) => renderMediumItem(file))}
                  </div>
                ) : null}

                {viewMode === "large" ? (
                  <div className="files-large-list">
                    {filteredFiles.map((file) => renderLargeItem(file))}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
