"use client";

import Image from "next/image";

import {
  type CSSProperties,
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createFileFolder,
  deleteFileFolder,
  deleteFolderFile,
  reconcileFileAutomations,
  renameFolderFile,
  reorderFolderFiles,
  updateFileAutomationSettings,
  updateFileFolder,
} from "@/components/files/api";

import type {
  FileAutomationRepositoryKey,
  FileFolderSummary,
  FileItem,
  VehicleFolderDisplayField,
} from "@/components/files/types";

import type { CurrentActor, Role } from "@/components/ui-grid/types";

import { reorderFiles } from "@/components/files/file-order";
import {
  buildFolderTree,
  collectFolderTreePathIds,
  flattenFolderOptions,
  type FolderTreeNode,
} from "@/components/files/folder-tree";
import { useFileManagerAutomationSettings } from "@/components/files/hooks/use-file-manager-automation-settings";
import { useFileManagerFolderData } from "@/components/files/hooks/use-file-manager-folder-data";
import { useFileManagerFolderFormState } from "@/components/files/hooks/use-file-manager-folder-form-state";
import { useFileManagerNavigationState } from "@/components/files/hooks/use-file-manager-navigation-state";
import { useFileManagerPreviewText } from "@/components/files/hooks/use-file-manager-preview-text";
import { useFileManagerQueryState } from "@/components/files/hooks/use-file-manager-query-state";
import { useFileSelection } from "@/components/files/hooks/use-file-selection";
import { useFileUploadFlow } from "@/components/files/hooks/use-file-upload-flow";
import { FilesBrowserToolbarSection } from "@/components/files/sections/files-browser-toolbar-section";
import { FilesCommandBarSection } from "@/components/files/sections/files-command-bar-section";
import {
  FileKindIcon,
  FolderIcon,
  getFileKindLabel,
  getFolderIconKind,
} from "@/components/files/icons";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import styles from "@/components/files/files.module.css";

import {
  formatBytes,
  getFilePreviewKind,
  MAX_FILE_UPLOAD_BATCH_BYTES,
  MAX_FILE_UPLOAD_COUNT,
} from "@/lib/files/shared";

type FileManagerWorkspaceProps = {
  actor: CurrentActor;

  accessToken: string | null;

  devRole?: Role | null;

  onSignOut: () => void | Promise<void>;
};

type ViewMode = "compact" | "medium" | "large";

type ExplorerItemSelection =
  | { type: "folder"; id: string }
  | { type: "file"; id: string }
  | null;

const FILE_AUTOMATION_REPOSITORY_LABELS: Record<FileAutomationRepositoryKey, string> = {
  vehicle_photos_active: "Fotos dos veiculos",
  vehicle_photos_sold: "Fotos vendidos",
  vehicle_documents_active: "Documentos",
  vehicle_documents_archive: "Documentos vendidos",
};

const VEHICLE_FOLDER_DISPLAY_OPTIONS: Array<{
  value: VehicleFolderDisplayField;
  label: string;
}> = [
  { value: "placa", label: "Placa" },
  { value: "nome", label: "Nome" },
  { value: "chassi", label: "Chassi" },
  { value: "modelo", label: "Modelo" },
  { value: "id", label: "ID" },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function isWithinDateRange(value: string, startDate: string, endDate: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return true;

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);

    if (parsed < start) return false;
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);

    if (parsed > end) return false;
  }

  return true;
}

function getFolderLabel(folder: Pick<FileFolderSummary, "name" | "displayName"> | null | undefined) {
  return folder?.displayName || folder?.name || "";
}

function getFolderTitle(folder: FileFolderSummary) {
  const label = getFolderLabel(folder);
  if (folder.isManagedFolder && folder.physicalName && folder.physicalName !== label) {
    return `${label} (${folder.physicalName})`;
  }

  return label;
}

function getFolderRoleLabel(folder: FileFolderSummary) {
  if (folder.automationRepositoryKey) {
    return FILE_AUTOMATION_REPOSITORY_LABELS[folder.automationRepositoryKey];
  }

  if (folder.automationKey === "vehicle_photos") return "Fotos do veiculo";
  if (folder.automationKey === "vehicle_documents") return "Documentos do veiculo";
  return null;
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

export function FileManagerWorkspace({
  actor,
  accessToken,
  devRole,
}: FileManagerWorkspaceProps) {
  const canManage = actor.role === "ADMINISTRADOR";

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadSectionRef = useRef<HTMLElement | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [downloadAllPending, setDownloadAllPending] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [info, setInfo] = useState<string | null>(null);

  const {
    activeFolder,
    activeFolderId,
    folderLoading,
    folders,
    foldersLoading,
    getActiveFolderId,
    loadActiveFolder,
    loadFolders,
    setActiveFolder,
    setActiveFolderId,
  } = useFileManagerFolderData({
    accessToken,
    devRole,
    setError,
  });

  const {
    applyAutomationSettings,
    automationDisplayField,
    automationLoading,
    automationPanelOpen,
    automationRepositories,
    automationSettings,
    setAutomationDisplayField,
    setAutomationPanelOpen,
    setAutomationRepositories,
  } = useFileManagerAutomationSettings({
    accessToken,
    canManage,
    devRole,
    setError,
  });

  const {
    closeCreatePanel: resetCreatePanel,
    createDescription,
    createName,
    createPanel,
    createParentFolderId,
    editDescription,
    editName,
    editParentFolderId,
    openCreatePanel: openCreatePanelState,
    setCreateDescription,
    setCreateName,
    setCreateParentFolderId,
    setEditDescription,
    setEditName,
    setEditParentFolderId,
    setSettingsOpen,
    settingsOpen,
  } = useFileManagerFolderFormState({ activeFolder });

  const {
    clearFileFilters,
    fileDateFrom,
    fileDateTo,
    fileQuery,
    previewMode,
    setFileDateFrom,
    setFileDateTo,
    setFileQuery,
    setPreviewMode,
  } = useFileManagerQueryState();

  const [viewMode, setViewMode] = useState<ViewMode>("medium");

  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);

  const [renameFileName, setRenameFileName] = useState("");

  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);

  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(
    null,
  );

  const [activeUploadDropzone, setActiveUploadDropzone] = useState(false);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);

  const rootFolders = folderTree;

  const folderOptions = useMemo(
    () => flattenFolderOptions(folderTree),
    [folderTree],
  );

  const rootFolderOptions = useMemo(
    () => rootFolders.map((folder) => ({ id: folder.id, label: getFolderLabel(folder) })),
    [rootFolders],
  );

  const filteredChildFolders = useMemo(
    () =>
      activeFolder
        ? activeFolder.childFolders.filter((folder) => {
            const matchesQuery = `${folder.name} ${folder.displayName}`
              .toLowerCase()
              .includes(fileQuery.trim().toLowerCase());

            if (!matchesQuery) return false;

            return isWithinDateRange(
              folder.updatedAt,
              fileDateFrom,
              fileDateTo,
            );
          })
        : [],

    [activeFolder, fileDateFrom, fileDateTo, fileQuery],
  );

  const filteredFiles = useMemo(
    () =>
      activeFolder
        ? activeFolder.files.filter((file) => {
            const matchesQuery = file.fileName
              .toLowerCase()
              .includes(fileQuery.trim().toLowerCase());

            if (!matchesQuery) return false;

            return isWithinDateRange(file.updatedAt, fileDateFrom, fileDateTo);
          })
        : [],

    [activeFolder, fileDateFrom, fileDateTo, fileQuery],
  );

  const {
    selectedFileId,
    selectedFileIdSet,
    setSelectedFileId,
    setSelectedFileIds,
    toggleFileSelection,
    toggleSelectAllVisibleFiles,
  } = useFileSelection({ filteredFiles });

  const selectedFile =
    filteredFiles.find((file) => file.id === selectedFileId) ??
    filteredFiles[0] ??
    null;

  const selectedFolder =
    filteredChildFolders.find((folder) => folder.id === selectedFolderId) ??
    null;

  const selectedExplorerItem: ExplorerItemSelection = selectedFolder
    ? { type: "folder", id: selectedFolder.id }
    : selectedFile
      ? { type: "file", id: selectedFile.id }
      : null;

  const selectedPreviewKind = getFilePreviewKind(
    selectedFile?.mimeType,
    selectedFile?.fileName,
  );

  const { previewLoading, previewText } = useFileManagerPreviewText({
    selectedFile,
    selectedPreviewKind,
  });

  const activeRootFolderId =
    activeFolder?.breadcrumb[0]?.id ?? activeFolder?.folder.id ?? null;

  const activeFolderTreePathIds = useMemo(
    () => collectFolderTreePathIds(folderTree, activeFolderId),
    [activeFolderId, folderTree],
  );

  const {
    expandedFolderIds,
    mobileExplorerCollapsed,
    mobileSection,
    navigateToFolder,
    setMobileExplorerCollapsed,
    setMobileSection,
    toggleFolderExpanded,
  } = useFileManagerNavigationState({
    activeFolderId,
    activeFolderTreePathIds,
    setActiveFolderId,
    setSelectedFolderId,
  });

  const {
    enqueueUploadFiles,
    pendingUploads,
    queuedUploadsCount,
  } = useFileUploadFlow({
    accessToken,
    devRole,
    getActiveFolderId,
    loadActiveFolder,
    loadFolders,
    onNavigateToFolder: navigateToFolder,
    setError,
    setInfo,
  });

  const uploadBusy = pendingUploads.length > 0 || queuedUploadsCount > 0;

  const activePendingUploads = pendingUploads.filter(
    (item) => item.folderId === activeFolderId,
  );

  const activeFolderBreadcrumbLabel = activeFolder
    ? activeFolder.breadcrumb.map((folder) => getFolderLabel(folder)).join(" / ")
    : "";

  const activeParentFolder =
    activeFolder?.breadcrumb.length && activeFolder.breadcrumb.length > 1
      ? activeFolder.breadcrumb[activeFolder.breadcrumb.length - 2]
      : null;

  const totalVisibleItems =
    filteredChildFolders.length +
    filteredFiles.length +
    activePendingUploads.length;

  const selectedFolderDepth = Math.max(
    (activeFolder?.breadcrumb.length ?? 1) - 1,
    0,
  );

  const hiddenItemsCount = activeFolder
    ? activeFolder.childFolders.length +
      activeFolder.files.length -
      filteredChildFolders.length -
      filteredFiles.length
    : 0;

  const mobileManageBadge =
    Number(Boolean(createPanel || settingsOpen || automationPanelOpen)) + queuedUploadsCount;

  const selectedVisibleFiles = useMemo(
    () => filteredFiles.filter((file) => selectedFileIdSet.has(file.id)),

    [filteredFiles, selectedFileIdSet],
  );

  const allVisibleFilesSelected =
    filteredFiles.length > 0 &&
    selectedVisibleFiles.length === filteredFiles.length;

  const selectedItemLabel =
    getFolderLabel(selectedFolder) || selectedFile?.fileName || "Nenhum item";

  useEffect(() => {
    if (!selectedFolderId) return;
    if (filteredChildFolders.some((folder) => folder.id === selectedFolderId)) return;
    setSelectedFolderId(null);
  }, [filteredChildFolders, selectedFolderId]);

  function openCreatePanel(parentFolderId: string | null) {
    openCreatePanelState(parentFolderId);

    setMobileSection("manage");

    setInfo(null);

    setError(null);
  }

  function closeCreatePanel() {
    resetCreatePanel();
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

          parentFolderId: createParentFolderId || null,
        },

        { accessToken, devRole },
      );

      closeCreatePanel();

      await loadFolders(response.folder.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao criar pasta.",
      );
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

          parentFolderId: editParentFolderId || null,
        },

        { accessToken, devRole },
      );

      setActiveFolder(detail);

      setSettingsOpen(false);

      await loadFolders(detail.folder.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao atualizar pasta.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolder() {
    if (!canManage || !activeFolder || submitting || uploadBusy) return;

    const confirmed = window.confirm(
      `Excluir a pasta "${getFolderLabel(activeFolder.folder)}" com toda a arvore e os arquivos?`,
    );

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
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao excluir pasta.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolderById(folderId: string) {
    if (!canManage || submitting || uploadBusy) return;

    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const confirmed = window.confirm(`Excluir a pasta "${getFolderLabel(folder)}" com toda a arvore e os arquivos?`);
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await deleteFileFolder(folderId, { accessToken, devRole });
      if (activeFolderId === folderId) {
        setActiveFolder(null);
        setActiveFolderId(folder.parentFolderId);
      }
      setSelectedFolderId(null);
      await loadFolders(activeFolderId === folderId ? folder.parentFolderId : activeFolderId);
      if (activeFolderId && activeFolderId !== folderId) {
        await loadActiveFolder(activeFolderId);
      }
      setInfo("Pasta excluida.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao excluir pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleUpload = useCallback(
    async (filesLike: FileList | File[], folderId: string) => {
      if (!canManage) return;

      setFolderDropTargetId(null);
      setActiveUploadDropzone(false);

      await enqueueUploadFiles(filesLike, folderId);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [canManage, enqueueUploadFiles],
  );

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

      setSelectedFileIds((current) =>
        current.filter((currentFileId) => currentFileId !== fileId),
      );

      await loadActiveFolder(activeFolder.folder.id);

      await loadFolders(activeFolder.folder.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao excluir arquivo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSelectedFiles() {
    if (
      !canManage ||
      !activeFolder ||
      submitting ||
      selectedVisibleFiles.length === 0
    )
      return;

    const confirmed = window.confirm(
      `Excluir ${selectedVisibleFiles.length} arquivo(s) selecionado(s)?`,
    );

    if (!confirmed) return;

    setSubmitting(true);

    setError(null);

    setInfo(null);

    const failedFileNames: string[] = [];

    try {
      for (const file of selectedVisibleFiles) {
        try {
          await deleteFolderFile(file.id, { accessToken, devRole });
        } catch {
          failedFileNames.push(file.fileName);
        }
      }

      setSelectedFileIds([]);

      await loadActiveFolder(activeFolder.folder.id);

      await loadFolders(activeFolder.folder.id);

      if (failedFileNames.length > 0) {
        setError(
          `Alguns arquivos nao puderam ser excluidos: ${failedFileNames.slice(0, 3).join(", ")}${failedFileNames.length > 3 ? "..." : ""}`,
        );
      } else {
        setInfo(
          `${selectedVisibleFiles.length} arquivo(s) excluido(s) com sucesso.`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRenameFile(
    event: FormEvent<HTMLFormElement>,
    fileId: string,
  ) {
    event.preventDefault();

    if (!canManage || !activeFolder || submitting) return;

    setSubmitting(true);

    setError(null);

    try {
      const detail = await renameFolderFile(
        fileId,

        {
          fileName: renameFileName,
        },

        { accessToken, devRole },
      );

      setActiveFolder(detail);

      setRenamingFileId(null);

      setRenameFileName("");

      await loadFolders(detail.folder.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao renomear arquivo.",
      );
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
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao baixar arquivo.",
      );
    }
  }

  async function handleDownloadAll() {
    if (!activeFolder || activeFolder.files.length === 0 || downloadAllPending)
      return;

    setDownloadAllPending(true);

    setError(null);

    try {
      for (const file of activeFolder.files) {
        if (!file.downloadUrl) continue;

        await downloadBlobFromUrl(file.downloadUrl, file.fileName);

        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao baixar a pasta.",
      );
    } finally {
      setDownloadAllPending(false);
    }
  }

  async function handleDropReorder(targetFileId: string) {
    if (
      !canManage ||
      !activeFolder ||
      !draggedFileId ||
      draggedFileId === targetFileId
    ) {
      return;
    }

    const nextFiles = reorderFiles(
      activeFolder.files,
      draggedFileId,
      targetFileId,
    );

    setDraggedFileId(null);

    setActiveFolder({
      ...activeFolder,

      files: nextFiles,
    });

    try {
      const detail = await reorderFolderFiles(
        activeFolder.folder.id,

        nextFiles.map((file) => file.id),

        { accessToken, devRole },
      );

      setActiveFolder(detail);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao reordenar arquivos.",
      );

      await loadActiveFolder(activeFolder.folder.id);
    }
  }

  async function handleMoveFolderToParent(folderId: string, parentFolderId: string | null) {
    if (!canManage || submitting || folderId === parentFolderId) return;

    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder || folder.parentFolderId === parentFolderId) {
      setDraggedFolderId(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await updateFileFolder(
        folderId,
        {
          parentFolderId
        },
        { accessToken, devRole }
      );

      setSelectedFolderId(folderId);
      await loadFolders(activeFolderId);
      if (activeFolderId) {
        await loadActiveFolder(activeFolderId);
      }
      setInfo(parentFolderId ? "Pasta movida." : "Pasta movida para a raiz.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao mover pasta.");
    } finally {
      setDraggedFolderId(null);
      setFolderDropTargetId(null);
      setSubmitting(false);
    }
  }

  async function handleMoveFileToFolder(fileId: string, folderId: string) {
    if (!canManage || !activeFolder || submitting) return;
    if (activeFolder.folder.id === folderId) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await renameFolderFile(
        fileId,
        {
          folderId
        },
        { accessToken, devRole }
      );

      setSelectedFileIds((current) => current.filter((currentFileId) => currentFileId !== fileId));
      if (selectedFileId === fileId) {
        setSelectedFileId(null);
      }
      await loadActiveFolder(activeFolder.folder.id);
      await loadFolders(activeFolder.folder.id);
      setInfo("Arquivo movido.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao mover arquivo.");
    } finally {
      setDraggedFileId(null);
      setFolderDropTargetId(null);
      setSubmitting(false);
    }
  }

  function handleUploadInputChange(event: ChangeEvent<HTMLInputElement>) {
    const folderId = activeFolder?.folder.id;

    const files = event.target.files;

    if (!folderId || !files?.length) return;

    void handleUpload(files, folderId);
  }

  function handleFolderFileDrop(
    folderId: string,
    event: DragEvent<HTMLElement>,
  ) {
    if (!canManage) return;

    event.preventDefault();
    event.stopPropagation();

    setFolderDropTargetId(null);

    if (draggedFolderId) {
      void handleMoveFolderToParent(draggedFolderId, folderId);
      return;
    }

    if (draggedFileId) {
      void handleMoveFileToFolder(draggedFileId, folderId);
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      navigateToFolder(folderId);

      void handleUpload(event.dataTransfer.files, folderId);
    }
  }

  function handleFolderDragOver(folderId: string, event: DragEvent<HTMLElement>) {
    if (!canManage) return;

    if (draggedFolderId === folderId) return;

    const types = Array.from(event.dataTransfer.types);
    const acceptsDrop = Boolean(draggedFolderId || draggedFileId || types.includes("Files"));
    if (!acceptsDrop) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = draggedFolderId || draggedFileId ? "move" : "copy";
    setFolderDropTargetId(folderId);
  }

  function handleRootDrop(event: DragEvent<HTMLElement>) {
    if (!canManage || !draggedFolderId) return;

    event.preventDefault();
    event.stopPropagation();
    void handleMoveFolderToParent(draggedFolderId, null);
  }

  function handleExplorerSurfaceDrop(event: DragEvent<HTMLElement>) {
    if (!canManage || !activeFolder) return;

    event.preventDefault();
    setActiveUploadDropzone(false);

    if (draggedFolderId) {
      void handleMoveFolderToParent(draggedFolderId, activeFolder.folder.id);
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      void handleUpload(event.dataTransfer.files, activeFolder.folder.id);
    }
  }

  function handleSelectFile(fileId: string) {
    setSelectedFolderId(null);

    setSelectedFileId(fileId);

    setPreviewMode((current) => (current === "hidden" ? "open" : current));

    setMobileSection("preview");
  }

  function handleSelectFolder(folderId: string) {
    setSelectedFolderId(folderId);
    setMobileSection("browser");
  }

  function openSelectedItem() {
    if (selectedFolder) {
      navigateToFolder(selectedFolder.id);
      return;
    }

    if (selectedFile) {
      setPreviewMode((current) => (current === "hidden" ? "open" : current));
      setMobileSection("preview");
    }
  }

  function handleOpenManageSection() {
    setMobileSection("manage");
  }

  function handleOpenAutomationPanel() {
    setAutomationPanelOpen(true);
    setMobileSection("manage");
    setError(null);
    setInfo(null);
  }

  async function handleSaveAutomationSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || submitting) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const settings = await updateFileAutomationSettings(
        {
          displayField: automationDisplayField,
          repositories: automationRepositories,
        },
        { accessToken, devRole },
      );

      applyAutomationSettings(settings);
      await loadFolders(activeFolderId);
      if (activeFolderId) {
        await loadActiveFolder(activeFolderId);
      }
      setInfo("Automacoes atualizadas.");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao salvar automacoes.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReconcileAutomations() {
    if (!canManage || submitting) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const result = await reconcileFileAutomations({ accessToken, devRole });
      await loadFolders(activeFolderId);
      if (activeFolderId) {
        await loadActiveFolder(activeFolderId);
      }
      setInfo(`${result.processed} veiculo(s) reconciliado(s).`);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao reconciliar automacoes.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenUploadSection() {
    setMobileSection("manage");

    setSettingsOpen(false);

    window.requestAnimationFrame(() => {
      uploadSectionRef.current?.scrollIntoView({
        behavior: "smooth",

        block: "start",
      });
    });
  }

  function handleActiveUploadDragOver(event: DragEvent<HTMLElement>) {
    if (!canManage || !activeFolder) return;

    if (!draggedFolderId && !Array.from(event.dataTransfer.types).includes("Files")) return;

    event.preventDefault();

    event.dataTransfer.dropEffect = draggedFolderId ? "move" : "copy";

    setActiveUploadDropzone(true);
  }

  function handleActiveUploadDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;

    setActiveUploadDropzone(false);
  }

  function handleActiveUploadDrop(event: DragEvent<HTMLElement>) {
    if (!canManage || !activeFolder) return;

    event.preventDefault();

    setActiveUploadDropzone(false);

    if (event.dataTransfer.files.length > 0) {
      void handleUpload(event.dataTransfer.files, activeFolder.folder.id);
    }
  }

  function renderFolderTreeNode(folder: FolderTreeNode, depth = 0) {
    const hasChildren = folder.children.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);
    const isActive = activeFolderId === folder.id;
    const isSelected = selectedFolderId === folder.id;
    const isDropTarget = folderDropTargetId === folder.id;
    const isPath = activeFolderTreePathIds.includes(folder.id);
    const folderLabel = getFolderLabel(folder);
    const roleLabel = getFolderRoleLabel(folder);
    const iconKind = getFolderIconKind(folder);
    const itemCount = folder.fileCount + folder.childFolderCount;

    return (
      <div key={folder.id} className="files-tree-node">
        <div
          className={`files-tree-row ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${isPath ? "is-path" : ""}`}
          style={{ "--files-tree-depth": depth } as CSSProperties}
        >
          <button
            type="button"
            className="files-tree-toggle"
            onClick={(event) => {
              event.stopPropagation();
              toggleFolderExpanded(folder.id);
            }}
            disabled={!hasChildren}
            aria-label={isExpanded ? `Recolher ${folderLabel}` : `Expandir ${folderLabel}`}
            aria-expanded={hasChildren ? isExpanded : undefined}
          >
            {hasChildren ? (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
                className={`files-tree-toggle-caret ${isExpanded ? "is-open" : ""}`}
              >
                <path
                  d="M3 1.5 7 5 3 8.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </button>

          <button
            type="button"
            className={`files-tree-folder ${isDropTarget ? "is-upload-target" : ""}`}
            draggable={canManage}
            onClick={() => navigateToFolder(folder.id)}
            onDragStart={(event) => {
              setDraggedFolderId(folder.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDraggedFolderId(null)}
            onDragOver={(event) => handleFolderDragOver(folder.id, event)}
            onDragLeave={() => {
              if (folderDropTargetId === folder.id) setFolderDropTargetId(null);
            }}
            onDrop={(event) => handleFolderFileDrop(folder.id, event)}
            title={roleLabel ? `${getFolderTitle(folder)} - ${roleLabel}` : getFolderTitle(folder)}
          >
            <FolderIcon kind={iconKind} className="files-tree-folder-icon" />
            <span className="files-tree-folder-label">{folderLabel}</span>
            {itemCount > 0 ? (
              <span className="files-tree-folder-count" aria-hidden="true">
                {itemCount}
              </span>
            ) : null}
          </button>
        </div>

        {hasChildren && isExpanded ? (
          <div className="files-tree-children">
            {folder.children.map((child) => renderFolderTreeNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderDirectoryFolderItem(folder: FileFolderSummary) {
    const folderLabel = getFolderLabel(folder);
    const roleLabel = getFolderRoleLabel(folder);
    const iconKind = getFolderIconKind(folder);

    return (
      <article
        key={folder.id}
        className={`files-list-row files-directory-row is-folder ${selectedFolderId === folder.id ? "is-selected" : ""}`}
        draggable={canManage}
        onDragStart={(event) => {
          setDraggedFolderId(folder.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggedFolderId(null)}
      >
        <button
          type="button"
          className={`files-directory-link ${folderDropTargetId === folder.id ? "is-upload-target" : ""}`}
          onClick={() => handleSelectFolder(folder.id)}
          onDoubleClick={() => navigateToFolder(folder.id)}
          onDragOver={(event) => handleFolderDragOver(folder.id, event)}
          onDragLeave={() => {
            if (folderDropTargetId === folder.id) setFolderDropTargetId(null);
          }}
          onDrop={(event) => handleFolderFileDrop(folder.id, event)}
        >
          <div className="files-thumb files-thumb-small files-thumb-folder">
            <FolderIcon kind={iconKind} size={24} />
          </div>

          <div className="files-list-main">
            <strong title={getFolderTitle(folder)}>{folderLabel}</strong>

            <div className="files-list-meta">
              <span>{folder.fileCount} arquivo(s)</span>

              <span>{folder.childFolderCount} pasta(s)</span>

              {roleLabel ? <span>{roleLabel}</span> : null}

              <span>{formatDateTime(folder.updatedAt)}</span>
            </div>
          </div>
        </button>
      </article>
    );
  }

  function renderCompactFolderItem(folder: FileFolderSummary) {
    const folderLabel = getFolderLabel(folder);
    const roleLabel = getFolderRoleLabel(folder);
    const iconKind = getFolderIconKind(folder);

    return (
      <article
        key={folder.id}
        className={`files-compact-item is-folder ${selectedFolderId === folder.id ? "is-selected" : ""} ${folderDropTargetId === folder.id ? "is-drop-target" : ""}`}
        draggable={canManage}
        onClick={() => handleSelectFolder(folder.id)}
        onDoubleClick={() => navigateToFolder(folder.id)}
        onDragStart={(event) => {
          setDraggedFolderId(folder.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggedFolderId(null)}
        onDragOver={(event) => handleFolderDragOver(folder.id, event)}
        onDragLeave={() => {
          if (folderDropTargetId === folder.id) setFolderDropTargetId(null);
        }}
        onDrop={(event) => handleFolderFileDrop(folder.id, event)}
      >
        <div className="files-thumb files-thumb-small files-thumb-folder">
          <FolderIcon kind={iconKind} size={24} />
        </div>
        <strong title={getFolderTitle(folder)}>{folderLabel}</strong>
        <small>
          {folder.fileCount} arq. / {folder.childFolderCount} pasta(s)
          {roleLabel ? ` - ${roleLabel}` : ""}
        </small>
      </article>
    );
  }

  function renderLargeFolderItem(folder: FileFolderSummary) {
    const folderLabel = getFolderLabel(folder);
    const roleLabel = getFolderRoleLabel(folder);
    const iconKind = getFolderIconKind(folder);

    return (
      <article
        key={folder.id}
        className={`files-large-item is-folder ${selectedFolderId === folder.id ? "is-selected" : ""} ${folderDropTargetId === folder.id ? "is-drop-target" : ""}`}
        draggable={canManage}
        onClick={() => handleSelectFolder(folder.id)}
        onDoubleClick={() => navigateToFolder(folder.id)}
        onDragStart={(event) => {
          setDraggedFolderId(folder.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggedFolderId(null)}
        onDragOver={(event) => handleFolderDragOver(folder.id, event)}
        onDragLeave={() => {
          if (folderDropTargetId === folder.id) setFolderDropTargetId(null);
        }}
        onDrop={(event) => handleFolderFileDrop(folder.id, event)}
      >
        <div className="files-thumb files-thumb-large files-thumb-folder">
          <FolderIcon kind={iconKind} size={48} />
        </div>
        <div className="files-large-main">
          <strong title={getFolderTitle(folder)}>{folderLabel}</strong>
          <div className="files-large-meta">
            <span>{folder.fileCount} arquivo(s)</span>
            <span>{folder.childFolderCount} pasta(s)</span>
            {roleLabel ? <span>{roleLabel}</span> : null}
            <span>Atualizada em {formatDateTime(folder.updatedAt)}</span>
          </div>
          <div className="files-list-actions">
            <button type="button" className="files-ghost-btn" onClick={() => navigateToFolder(folder.id)}>
              Abrir
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderFileThumbnail(
    file: {
      fileName: string;

      mimeType: string;

      previewUrl: string | null;

      isMissing?: boolean;
    },

    variant: "small" | "large",
  ) {
    const kind = getFilePreviewKind(file.mimeType, file.fileName);

    if (file.previewUrl && kind === "image" && !file.isMissing) {
      return (
        <div className={`files-thumb files-thumb-${variant}`}>
          <Image
            src={file.previewUrl}
            alt={file.fileName}
            fill
            unoptimized
            sizes={variant === "large" ? "320px" : "72px"}
          />
        </div>
      );
    }

    const iconSize = variant === "large" ? 56 : 24;

    return (
      <div
        className={`files-thumb files-thumb-${variant} files-thumb-fallback`}
        aria-label={getFileKindLabel(kind, file.isMissing)}
      >
        <FileKindIcon kind={kind} missing={file.isMissing} size={iconSize} />
      </div>
    );
  }

  function renderPreviewStage() {
    if (!selectedFile) {
      return <div className="files-preview-empty">Selecione um arquivo.</div>;
    }

    if (!selectedFile.previewUrl || selectedFile.isMissing) {
      return (
        <div className="files-preview-empty">
          Preview indisponivel para este arquivo.
        </div>
      );
    }

    switch (selectedPreviewKind) {
      case "image":
        return (
          <div className="files-preview-visual">
            <Image
              src={selectedFile.previewUrl}
              alt={selectedFile.fileName}
              fill
              unoptimized
              sizes="640px"
            />
          </div>
        );

      case "pdf":
        return (
          <iframe
            className="files-preview-frame"
            title={selectedFile.fileName}
            src={selectedFile.previewUrl}
          />
        );

      case "video":
        return (
          <video
            className="files-preview-media"
            src={selectedFile.previewUrl}
            controls
            preload="metadata"
          />
        );

      case "audio":
        return (
          <div className="files-preview-audio">
            <audio src={selectedFile.previewUrl} controls preload="metadata" />
          </div>
        );

      case "text":
        return (
          <pre className="files-preview-text">
            {previewLoading
              ? "Carregando..."
              : previewText || "Preview textual vazio."}
          </pre>
        );

      default:
        return (
          <div className="files-preview-empty">
            Sem preview inline para este tipo.
          </div>
        );
    }
  }

  function renderCompactItem(file: FileItem) {
    return (
      <article
        key={file.id}
        className={`files-compact-item ${!selectedFolderId && selectedFileId === file.id ? "is-selected" : ""}`}
        draggable={canManage}
        onClick={() => handleSelectFile(file.id)}
        onDragStart={() => setDraggedFileId(file.id)}
        onDragEnd={() => setDraggedFileId(null)}
        onDragOver={(event) => {
          if (!canManage) return;

          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          void handleDropReorder(file.id);
        }}
      >
        {canManage ? (
          <label
            className="files-item-select"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectedFileIdSet.has(file.id)}
              onChange={() => toggleFileSelection(file.id)}
            />
          </label>
        ) : null}

        {renderFileThumbnail(file, "small")}

        <strong title={file.fileName}>{file.fileName}</strong>
      </article>
    );
  }

  function renderMediumItem(file: FileItem) {
    return (
      <article
        key={file.id}
        className={`files-list-row ${!selectedFolderId && selectedFileId === file.id ? "is-selected" : ""} ${canManage ? "has-selection" : ""}`}
        draggable={canManage}
        onClick={() => handleSelectFile(file.id)}
        onDragStart={() => setDraggedFileId(file.id)}
        onDragEnd={() => setDraggedFileId(null)}
        onDragOver={(event) => {
          if (!canManage) return;

          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          void handleDropReorder(file.id);
        }}
      >
        {canManage ? (
          <label
            className="files-item-select"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectedFileIdSet.has(file.id)}
              onChange={() => toggleFileSelection(file.id)}
            />
          </label>
        ) : null}

        {renderFileThumbnail(file, "small")}

        <div className="files-list-main">
          {renamingFileId === file.id ? (
            <form
              className="files-rename-form"
              onSubmit={(event) => void handleRenameFile(event, file.id)}
            >
              <input
                value={renameFileName}
                onChange={(event) => setRenameFileName(event.target.value)}
              />

              <div className="files-list-actions">
                <button
                  type="submit"
                  className={styles.btn}
                  disabled={submitting}
                >
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
          <button
            type="button"
            className="files-ghost-btn"
            onClick={() => void handleDownloadFile(file)}
            disabled={!file.downloadUrl}
          >
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

              <button
                type="button"
                className="files-danger-btn"
                onClick={() => void handleDeleteFile(file.id)}
              >
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
        className={`files-large-item ${!selectedFolderId && selectedFileId === file.id ? "is-selected" : ""} ${canManage ? "has-selection" : ""}`}
        draggable={canManage}
        onClick={() => handleSelectFile(file.id)}
        onDragStart={() => setDraggedFileId(file.id)}
        onDragEnd={() => setDraggedFileId(null)}
        onDragOver={(event) => {
          if (!canManage) return;

          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          void handleDropReorder(file.id);
        }}
      >
        {canManage ? (
          <label
            className="files-item-select"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectedFileIdSet.has(file.id)}
              onChange={() => toggleFileSelection(file.id)}
            />
          </label>
        ) : null}

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
            <button
              type="button"
              className="files-ghost-btn"
              onClick={() => handleSelectFile(file.id)}
            >
              Preview
            </button>

            <button
              type="button"
              className="files-ghost-btn"
              onClick={() => void handleDownloadFile(file)}
              disabled={!file.downloadUrl}
            >
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

                <button
                  type="button"
                  className="files-danger-btn"
                  onClick={() => void handleDeleteFile(file.id)}
                >
                  Excluir
                </button>
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderPreviewSection(className?: string) {
    if (previewMode === "hidden") {
      return null;
    }

    return (
      <section
        className={`files-side-card files-preview-shell files-mobile-panel ${className ?? ""}`.trim()}
      >
        <div className="files-section-head">
          <div>
            <span className="files-section-kicker">Preview</span>

            <strong>
              {selectedFile ? "Arquivo selecionado" : "Nenhum arquivo"}
            </strong>
          </div>

          {selectedFile ? (
            <div className="files-toolbar-group">
              <button
                type="button"
                className="files-ghost-btn"
                onClick={() => {
                  setPreviewMode("hidden");

                  setMobileSection("browser");
                }}
              >
                Minimizar
              </button>

              <button
                type="button"
                className="files-ghost-btn"
                onClick={() =>
                  setPreviewMode((current) =>
                    current === "expanded" ? "open" : "expanded",
                  )
                }
              >
                {previewMode === "expanded" ? "Compactar" : "Expandir"}
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`files-preview-panel ${previewMode === "expanded" ? "is-expanded" : ""}`}
        >
          <div className="files-preview-stage">{renderPreviewStage()}</div>

          <div className="files-preview-side">
            {selectedFile ? (
              <>
                <strong title={selectedFile.fileName}>
                  {selectedFile.fileName}
                </strong>

                {activeFolderBreadcrumbLabel ? (
                  <p className="files-preview-context">
                    {activeFolderBreadcrumbLabel}
                  </p>
                ) : null}

                <div className="files-list-meta">
                  <span>{formatBytes(selectedFile.sizeBytes)}</span>

                  <span>
                    {selectedFile.mimeType || "application/octet-stream"}
                  </span>

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

                        setMobileSection("browser");
                      }}
                    >
                      Renomear
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <span className="files-inline-note">
                Sem arquivo selecionado.
              </span>
            )}
          </div>
        </div>
      </section>
    );
  }

  function renderManageSection(className?: string) {
    return (
      <div
        className={`files-manage-stack files-mobile-panel ${className ?? ""}`.trim()}
      >
        <div className="files-management-grid">
          <section className="files-side-card files-folder-summary-card">
            <div className="files-section-head">
              <div>
                <span className="files-section-kicker">Resumo</span>

                <strong>{getFolderLabel(activeFolder?.folder)}</strong>
              </div>

              {canManage ? (
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={() => setSettingsOpen((current) => !current)}
                >
                  {settingsOpen ? "Fechar ajustes" : "Ajustes"}
                </button>
              ) : null}
            </div>

            <p className="files-meta-line">
              {activeFolder?.folder.description?.trim() ||
                "Pasta pronta para operacoes rapidas do dia a dia."}
            </p>

            {activeFolderBreadcrumbLabel ? (
              <p className="files-folder-summary-path">
                {activeFolderBreadcrumbLabel}
              </p>
            ) : null}

            <div className="files-inline-actions files-folder-shortcuts">
              <button
                type="button"
                className="files-ghost-btn"
                onClick={() =>
                  navigateToFolder(activeRootFolderId ?? activeFolder?.folder.id ?? "")
                }
                disabled={!activeFolder}
              >
                Abrir raiz
              </button>

              <button
                type="button"
                className="files-ghost-btn"
                onClick={() =>
                  navigateToFolder(activeParentFolder?.id ?? activeFolder?.folder.id ?? "")
                }
                disabled={!activeParentFolder}
              >
                Pasta pai
              </button>
            </div>

            <div className="files-overview-grid files-overview-grid-compact">
              <article className="files-overview-card">
                <small>Arquivos</small>

                <strong>{activeFolder?.files.length ?? 0}</strong>
              </article>

              <article className="files-overview-card">
                <small>Subpastas</small>

                <strong>{activeFolder?.childFolders.length ?? 0}</strong>
              </article>

              <article className="files-overview-card">
                <small>Atualizada</small>

                <strong>
                  {activeFolder
                    ? new Date(
                        activeFolder.folder.updatedAt,
                      ).toLocaleDateString("pt-BR")
                    : "--"}
                </strong>
              </article>
            </div>
          </section>

          {selectedExplorerItem ? (
            <section className="files-side-card files-selected-item-card">
              <div className="files-section-head">
                <div>
                  <span className="files-section-kicker">Selecionado</span>

                  <strong>{selectedItemLabel}</strong>
                </div>

                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={openSelectedItem}
                >
                  {selectedExplorerItem.type === "folder" ? "Abrir" : "Preview"}
                </button>
              </div>

              <p className="files-meta-line">
                {selectedExplorerItem.type === "folder"
                  ? selectedFolder?.description?.trim() ||
                    "Pasta pronta para receber, mover ou organizar arquivos."
                  : `${formatBytes(selectedFile?.sizeBytes ?? 0)} · ${selectedFile?.mimeType || "application/octet-stream"} · ${selectedFile ? formatDateTime(selectedFile.updatedAt) : ""}`}
              </p>

              {selectedExplorerItem.type === "file" && selectedFile ? (
                <div className="files-inline-actions files-selected-item-actions">
                  <button
                    type="button"
                    className="files-ghost-btn"
                    onClick={() => void handleDownloadFile(selectedFile)}
                    disabled={!selectedFile.downloadUrl}
                  >
                    Baixar
                  </button>

                  {canManage ? (
                    <>
                      <button
                        type="button"
                        className="files-ghost-btn"
                        onClick={() => {
                          setRenamingFileId(selectedFile.id);
                          setRenameFileName(selectedFile.fileName);
                          setViewMode("medium");
                          setMobileSection("browser");
                        }}
                      >
                        Renomear
                      </button>

                      <button
                        type="button"
                        className="files-danger-btn"
                        onClick={() => void handleDeleteFile(selectedFile.id)}
                        disabled={submitting}
                      >
                        Excluir
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {selectedExplorerItem.type === "folder" && selectedFolder ? (
                <div className="files-inline-actions files-selected-item-actions">
                  <button
                    type="button"
                    className="files-ghost-btn"
                    onClick={() => openCreatePanel(selectedFolder.id)}
                  >
                    Nova subpasta
                  </button>

                  <button
                    type="button"
                    className="files-ghost-btn"
                    onClick={() => void handleMoveFolderToParent(selectedFolder.id, null)}
                    disabled={!selectedFolder.parentFolderId || submitting}
                  >
                    Mover para raiz
                  </button>

                  <button
                    type="button"
                    className="files-danger-btn"
                    onClick={() => void handleDeleteFolderById(selectedFolder.id)}
                    disabled={submitting || uploadBusy}
                  >
                    Excluir
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {canManage ? (
            <section
              ref={uploadSectionRef}
              className={`files-upload-zone files-side-card ${activeUploadDropzone ? "is-active" : ""}`}
              onDragOver={handleActiveUploadDragOver}
              onDragEnter={handleActiveUploadDragOver}
              onDragLeave={handleActiveUploadDragLeave}
              onDrop={handleActiveUploadDrop}
            >
              <div className="files-section-head">
                <div>
                  <span className="files-section-kicker">Upload principal</span>

                  <strong>Enviar arquivos para esta pasta</strong>
                </div>

                {queuedUploadsCount > 0 ? (
                  <span className="files-inline-note">
                    {queuedUploadsCount} lote(s)
                  </span>
                ) : null}
              </div>

              <p className="files-meta-line">
                Use este bloco como ponto principal de envio. Arraste arquivos
                para ca ou abra o seletor.
              </p>

              <div className="files-inline-actions">
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Selecionar arquivos
                </button>

                <small>
                  Até {MAX_FILE_UPLOAD_COUNT} arquivos por vez. Se passar de{" "}
                  {Math.round(MAX_FILE_UPLOAD_BATCH_BYTES / (1024 * 1024))} MB,
                  o sistema divide em lotes automaticamente.
                </small>
              </div>
            </section>
          ) : null}

          {canManage ? (
            <section className="files-action-panel files-side-card">
              <div className="files-panel-head">
                <div>
                  <span className="files-section-kicker">Automacoes</span>

                  <strong>Repositorios de veiculos</strong>
                </div>

                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={() =>
                    setAutomationPanelOpen((current) => !current)
                  }
                >
                  {automationPanelOpen ? "Fechar" : "Configurar"}
                </button>
              </div>

              <p className="files-meta-line">
                {automationSettings
                  ? "Pastas vinculadas por ID continuam funcionando apos renomear."
                  : automationLoading
                    ? "Carregando automacoes..."
                    : "Configure os repositorios das pastas automaticas."}
              </p>

              {automationPanelOpen ? (
                <form onSubmit={handleSaveAutomationSettings}>
                  <label className="files-field">
                    <span>Exibir veiculo como</span>
                    <select
                      value={automationDisplayField}
                      onChange={(event) =>
                        setAutomationDisplayField(
                          event.target.value as VehicleFolderDisplayField,
                        )
                      }
                    >
                      {VEHICLE_FOLDER_DISPLAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(
                    Object.keys(
                      FILE_AUTOMATION_REPOSITORY_LABELS,
                    ) as FileAutomationRepositoryKey[]
                  ).map((key) => (
                    <label className="files-field" key={key}>
                      <span>{FILE_AUTOMATION_REPOSITORY_LABELS[key]}</span>
                      <select
                        value={automationRepositories[key]}
                        onChange={(event) =>
                          setAutomationRepositories((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione uma pasta raiz</option>
                        {rootFolderOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}

                  <div className="files-inline-actions">
                    <button
                      type="submit"
                      className={styles.btn}
                      disabled={submitting || automationLoading}
                    >
                      {submitting ? "Salvando..." : "Salvar automacoes"}
                    </button>

                    <button
                      type="button"
                      className="files-ghost-btn"
                      onClick={() => void handleReconcileAutomations()}
                      disabled={submitting || automationLoading}
                    >
                      Reconciliar
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}

          {createPanel ? (
            <form
              className="files-action-panel files-side-card"
              onSubmit={handleCreateFolder}
            >
              <div className="files-panel-head">
                <div>
                  <span className="files-section-kicker">Criar</span>

                  <strong>
                    {createPanel.parentFolderId
                      ? "Nova subpasta"
                      : "Nova pasta"}
                  </strong>
                </div>

                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={closeCreatePanel}
                >
                  Fechar
                </button>
              </div>

              <select
                value={createParentFolderId}
                onChange={(event) =>
                  setCreateParentFolderId(event.target.value)
                }
              >
                <option value="">Sem pasta pai</option>

                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                className={styles.input}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Nome"
              />

              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                rows={3}
                placeholder="Descricao"
              />

              <button
                type="submit"
                className={styles.btn}
                disabled={submitting}
              >
                {submitting ? "Salvando..." : "Criar pasta"}
              </button>
            </form>
          ) : null}

          {settingsOpen && canManage ? (
            <form
              className="files-action-panel files-side-card"
              onSubmit={handleUpdateFolder}
            >
              <div className="files-panel-head">
                <div>
                  <span className="files-section-kicker">Editar</span>

                  <strong>Configuracao da pasta</strong>
                </div>

                <button
                  type="button"
                  className="files-danger-btn"
                  onClick={() => void handleDeleteFolder()}
                  disabled={submitting || uploadBusy}
                >
                  Excluir
                </button>
              </div>

              <select
                value={editParentFolderId}
                onChange={(event) => setEditParentFolderId(event.target.value)}
              >
                <option value="">Sem pasta pai</option>

                {folderOptions

                  .filter((option) => option.id !== activeFolder?.folder.id)

                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>

              <input
                className={styles.input}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Nome"
              />

              <textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={3}
                placeholder="Descricao"
              />

              <button
                type="submit"
                className={styles.btn}
                disabled={submitting}
              >
                {submitting ? "Salvando..." : "Salvar alteracoes"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className="files-shell">
      <WorkspaceHeader actor={actor} title="Arquivos" />

      <section className="files-main files-main-standalone">
        <FilesCommandBarSection
          subtitle={activeFolder ? "Pasta ativa" : "Central de arquivos"}
          title={getFolderLabel(activeFolder?.folder) || "Arquivos"}
          description={
            activeFolder
              ? activeFolder.folder.description?.trim() ||
                "Navegue, faca upload e resolva arquivos sem abrir varios paineis ao mesmo tempo."
              : "Escolha uma pasta para comecar a trabalhar."
          }
          breadcrumb={
            activeFolder ? (
              <div className="files-path">
                {activeFolder.breadcrumb.map((folder, index) => (
                  <span key={folder.id}>
                    <button
                      type="button"
                      className="files-path-link"
                      onClick={() => navigateToFolder(folder.id)}
                    >
                      {getFolderLabel(folder)}
                    </button>
                    {index < activeFolder.breadcrumb.length - 1 ? " / " : ""}
                  </span>
                ))}
              </div>
            ) : null
          }
          miniStats={
            activeFolder ? (
              <div className="files-mini-stats">
                <span>{activeFolder.files.length} arquivo(s)</span>
                <span>{activeFolder.childFolders.length} pasta(s)</span>
                <span>Nivel {selectedFolderDepth + 1}</span>
                {uploadBusy ? (
                  <span>{pendingUploads.length} envio(s)</span>
                ) : null}
              </div>
            ) : null
          }
          actions={
            <>
              {canManage ? (
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    openCreatePanel(activeFolder?.folder.id ?? null)
                  }
                >
                  {activeFolder ? "Nova subpasta" : "Nova pasta"}
                </button>
              ) : null}
              {canManage && activeFolder ? (
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={handleOpenUploadSection}
                >
                  Ir para upload
                </button>
              ) : null}
              {activeFolder ? (
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={() => void handleDownloadAll()}
                  disabled={
                    activeFolder.files.length === 0 || downloadAllPending
                  }
                >
                  {downloadAllPending ? "Baixando..." : "Baixar pasta"}
                </button>
              ) : null}
              <button
                type="button"
                className="files-ghost-btn"
                onClick={() => void loadFolders(activeFolderId)}
                disabled={foldersLoading}
              >
                Atualizar
              </button>
              {canManage && activeFolder ? (
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={handleOpenManageSection}
                >
                  Gerir pasta
                </button>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  className="files-ghost-btn"
                  onClick={handleOpenAutomationPanel}
                >
                  Automacoes
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleUploadInputChange}
              />
            </>
          }
        />

        {error ? <p className="files-feedback is-error">{error}</p> : null}

        {info ? <p className="files-feedback is-info">{info}</p> : null}

        {activeFolder ? (
          <section
            className="files-mobile-switcher"
            aria-label="Secoes do workspace de arquivos"
          >
            <button
              type="button"
              className={mobileSection === "browser" ? "is-active" : ""}
              onClick={() => setMobileSection("browser")}
            >
              Navegar
            </button>

            <button
              type="button"
              className={mobileSection === "preview" ? "is-active" : ""}
              onClick={() => setMobileSection("preview")}
            >
              Preview
              {selectedFile ? <small>1</small> : null}
            </button>

            <button
              type="button"
              className={mobileSection === "manage" ? "is-active" : ""}
              onClick={() => setMobileSection("manage")}
            >
              Gerir
              {mobileManageBadge > 0 ? (
                <small>{mobileManageBadge}</small>
              ) : null}
            </button>
          </section>
        ) : null}

        {!activeFolder && !folderLoading ? (
          <section className="files-empty-state">
            <strong>Selecione uma pasta.</strong>
          </section>
        ) : null}

        {activeFolder ? (
          <div className="files-workspace-grid">
            <aside
              className={`files-workspace-column files-explorer-column ${mobileSection !== "browser" ? "is-mobile-hidden" : ""}`}
            >
              <section
                className={`files-side-card files-explorer-card files-roots-sidebar ${mobileExplorerCollapsed ? "is-collapsed-mobile" : ""}`}
              >
                <div className="files-section-head">
                  <div>
                    <span className="files-section-kicker">Explorar</span>

                    <strong>Pastas</strong>
                  </div>

                  <div className="files-toolbar-group">
                    <button
                      type="button"
                      className="files-ghost-btn files-mobile-only"
                      onClick={() =>
                        setMobileExplorerCollapsed((current) => !current)
                      }
                    >
                      {mobileExplorerCollapsed ? "Abrir menu" : "Fechar menu"}
                    </button>

                    {canManage ? (
                      <button
                        type="button"
                        className="files-ghost-btn"
                        onClick={() => openCreatePanel(activeRootFolderId)}
                      >
                        Nova pasta
                      </button>
                    ) : null}
                  </div>
                </div>

                <p className="files-meta-line">
                  {folders.length} pasta(s) disponivel(is)
                </p>

                {activeFolderBreadcrumbLabel ? (
                  <p className="files-meta-line files-path-line">
                    {activeFolderBreadcrumbLabel}
                  </p>
                ) : null}

                <div className="files-folder-tree-list">
                  {foldersLoading ? (
                    <p className="files-inline-note">Carregando pastas...</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="files-root-dropzone"
                        onDragOver={(event) => {
                          if (!canManage || !draggedFolderId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={handleRootDrop}
                      >
                        Raiz
                      </button>
                      {rootFolders.map((folder) => renderFolderTreeNode(folder))}
                    </>
                  )}
                </div>
              </section>
            </aside>

            <div className="files-workspace-column files-browser-column files-main-column">
              <FilesBrowserToolbarSection
                mobileHidden={mobileSection !== "browser"}
                primary={
                  <>
                    <input
                      value={fileQuery}
                      onChange={(event) => setFileQuery(event.target.value)}
                      placeholder="Buscar arquivos e pastas..."
                    />
                    <label className="files-date-filter">
                      <span>De</span>
                      <input
                        type="date"
                        value={fileDateFrom}
                        onChange={(event) =>
                          setFileDateFrom(event.target.value)
                        }
                      />
                    </label>
                    <label className="files-date-filter">
                      <span>Ate</span>
                      <input
                        type="date"
                        value={fileDateTo}
                        onChange={(event) => setFileDateTo(event.target.value)}
                      />
                    </label>
                  </>
                }
                secondary={
                  <>
                    <span className="files-selected-context">
                      {selectedExplorerItem
                        ? `${selectedExplorerItem.type === "folder" ? "Pasta" : "Arquivo"}: ${selectedItemLabel}`
                        : "Nenhum item"}
                    </span>
                    {selectedExplorerItem ? (
                      <button
                        type="button"
                        className="files-ghost-btn"
                        onClick={openSelectedItem}
                      >
                        {selectedExplorerItem.type === "folder" ? "Abrir" : "Preview"}
                      </button>
                    ) : null}
                    {selectedFile && !selectedFolder ? (
                      <button
                        type="button"
                        className="files-ghost-btn"
                        onClick={() => void handleDownloadFile(selectedFile)}
                        disabled={!selectedFile.downloadUrl}
                      >
                        Baixar
                      </button>
                    ) : null}
                    {canManage && selectedFile && !selectedFolder ? (
                      <>
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
                        <button
                          type="button"
                          className="files-danger-btn"
                          onClick={() => void handleDeleteFile(selectedFile.id)}
                          disabled={submitting}
                        >
                          Excluir
                        </button>
                      </>
                    ) : null}
                    {canManage && selectedFolder ? (
                      <>
                        <button
                          type="button"
                          className="files-ghost-btn"
                          onClick={() => openCreatePanel(selectedFolder.id)}
                        >
                          Nova subpasta
                        </button>
                        <button
                          type="button"
                          className="files-ghost-btn"
                          onClick={() => void handleMoveFolderToParent(selectedFolder.id, null)}
                          disabled={!selectedFolder.parentFolderId || submitting}
                        >
                          Mover para raiz
                        </button>
                        <button
                          type="button"
                          className="files-danger-btn"
                          onClick={() => void handleDeleteFolderById(selectedFolder.id)}
                          disabled={submitting || uploadBusy}
                        >
                          Excluir
                        </button>
                      </>
                    ) : null}
                    {canManage && filteredFiles.length > 0 ? (
                      <>
                        <button
                          type="button"
                          className="files-ghost-btn"
                          onClick={toggleSelectAllVisibleFiles}
                        >
                          {allVisibleFilesSelected
                            ? "Limpar selecao"
                            : "Selecionar visiveis"}
                        </button>
                        {selectedVisibleFiles.length > 0 ? (
                          <span className="files-inline-note">
                            {selectedVisibleFiles.length} selecionado(s)
                          </span>
                        ) : null}
                        {selectedVisibleFiles.length > 0 ? (
                          <button
                            type="button"
                            className="files-danger-btn"
                            onClick={() => void handleDeleteSelectedFiles()}
                            disabled={submitting}
                          >
                            Excluir selecionados
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {fileQuery || fileDateFrom || fileDateTo ? (
                      <button
                        type="button"
                        className="files-ghost-btn"
                        onClick={clearFileFilters}
                      >
                        Limpar filtros
                      </button>
                    ) : null}
                    {selectedFile && !selectedFolder ? (
                      <button
                        type="button"
                        className="files-ghost-btn"
                        onClick={() => {
                          const nextPreviewMode =
                            previewMode === "hidden" ? "open" : "hidden";
                          setPreviewMode(nextPreviewMode);
                          setMobileSection(
                            nextPreviewMode === "hidden"
                              ? "browser"
                              : "preview",
                          );
                        }}
                      >
                        {previewMode === "hidden"
                          ? "Abrir preview"
                          : "Ocultar preview"}
                      </button>
                    ) : null}
                    <div className="files-view-modes">
                      <button
                        type="button"
                        className={viewMode === "compact" ? "is-active" : ""}
                        onClick={() => setViewMode("compact")}
                      >
                        Compacto
                      </button>
                      <button
                        type="button"
                        className={viewMode === "medium" ? "is-active" : ""}
                        onClick={() => setViewMode("medium")}
                      >
                        Lista
                      </button>
                      <button
                        type="button"
                        className={viewMode === "large" ? "is-active" : ""}
                        onClick={() => setViewMode("large")}
                      >
                        Cards
                      </button>
                    </div>
                  </>
                }
              />

              {renderPreviewSection(
                mobileSection !== "preview" ? "is-mobile-hidden" : "",
              )}

              <section
                className={`files-list-panel files-mobile-panel ${activeUploadDropzone ? "is-active-dropzone" : ""} ${mobileSection !== "browser" ? "is-mobile-hidden" : ""}`}
                onDragOver={handleActiveUploadDragOver}
                onDragLeave={handleActiveUploadDragLeave}
                onDrop={handleExplorerSurfaceDrop}
              >
                <div className="files-list-panel-head">
                  <div>
                    <strong>Conteudo da pasta</strong>

                    <p className="files-meta-line">
                      {totalVisibleItems} item(ns) visivel(is)
                      {hiddenItemsCount > 0
                        ? ` - ${hiddenItemsCount} oculto(s) por filtro`
                        : ""}
                    </p>
                  </div>

                  <div className="files-mini-stats">
                    {activePendingUploads.length > 0 ? (
                      <span>{activePendingUploads.length} em envio</span>
                    ) : null}

                    <span>
                      {viewMode === "medium"
                        ? "Lista"
                        : viewMode === "large"
                          ? "Cards"
                          : "Compacto"}
                    </span>
                  </div>
                </div>

                {folderLoading ? (
                  <p className="files-inline-note">Carregando...</p>
                ) : null}

                {!folderLoading &&
                filteredChildFolders.length === 0 &&
                filteredFiles.length === 0 &&
                activePendingUploads.length === 0 ? (
                  <p className="files-inline-note">
                    {fileQuery
                      ? "Nada encontrado."
                      : "Sem itens neste diretorio."}
                  </p>
                ) : null}

                {viewMode === "medium" ? (
                  <div className="files-list-stack files-directory-list">
                    <div
                      className={`files-explorer-header-row ${canManage ? "has-selection" : ""}`}
                    >
                      {canManage ? <span /> : null}
                      <span />
                      <span>Nome</span>
                      <span>Acoes</span>
                    </div>

                    {filteredChildFolders.map((folder) =>
                      renderDirectoryFolderItem(folder),
                    )}

                    {activePendingUploads.map((file) => (
                      <article
                        key={file.id}
                        className="files-list-row is-pending"
                      >
                        {renderFileThumbnail(file, "small")}

                        <div className="files-list-main">
                          <strong title={file.fileName}>{file.fileName}</strong>

                          <div className="files-list-meta">
                            <span>{formatBytes(file.sizeBytes)}</span>

                            <span>
                              {file.mimeType || "application/octet-stream"}
                            </span>

                            <span>{file.status}</span>
                          </div>
                        </div>
                      </article>
                    ))}

                    {filteredFiles.map((file) => renderMediumItem(file))}
                  </div>
                ) : null}

                {viewMode === "compact" ? (
                  <div className="files-compact-grid">
                    {filteredChildFolders.map((folder) =>
                      renderCompactFolderItem(folder),
                    )}
                    {filteredFiles.map((file) => renderCompactItem(file))}
                  </div>
                ) : null}

                {viewMode === "large" ? (
                  <div className="files-large-list">
                    {filteredChildFolders.map((folder) =>
                      renderLargeFolderItem(folder),
                    )}
                    {filteredFiles.map((file) => renderLargeItem(file))}
                  </div>
                ) : null}
              </section>

            </div>

            <aside
              className={`files-workspace-column files-manage-column ${mobileSection !== "manage" ? "is-mobile-hidden" : ""}`}
            >
              {renderManageSection()}
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}
