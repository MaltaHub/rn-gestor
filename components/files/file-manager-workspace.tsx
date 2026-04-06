"use client";















import Image from "next/image";







import { ChangeEvent, DragEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";







import {
  createFileFolder,
  deleteFileFolder,
  deleteFolderFile,
  fetchFileFolderDetail,
  fetchFileFolders,
  renameFolderFile,
  reorderFolderFiles,
  updateFileFolder,
  uploadFolderFiles,
  prepareFolderUploads,
  finalizeFolderUploads
} from "@/components/files/api";







import type { FileFolderDetail, FileFolderSummary, FileItem } from "@/components/files/types";







import type { CurrentActor, Role } from "@/components/ui-grid/types";







import { WorkspaceHeader } from "@/components/workspace/workspace-header";







import {







  formatBytes,







  getFilePreviewKind,







  MAX_FILE_UPLOAD_BATCH_BYTES,







  MAX_FILE_UPLOAD_COUNT,







  type FilePreviewKind,







  isPreviewableFile







} from "@/lib/files/shared";















type FileManagerWorkspaceProps = {







  actor: CurrentActor;







  accessToken: string | null;







  devRole?: Role | null;







  onSignOut: () => void | Promise<void>;







};















type PendingUploadStatus = "queued" | "uploading" | "failed" | "canceled" | "completed";































type PendingUploadItem = {















  id: string;















  batchId: string;















  folderId: string;















  fileName: string;















  file: File;















  mimeType: string;















  sizeBytes: number;















  previewUrl: string | null;















  createdAt: string;















  status: PendingUploadStatus;















  attempts: number;















  errorMessage?: string | null;















};































type PendingUploadBatch = {















  id: string;















  folderId: string;















  files: File[];















  pendingIds: string[];















  attempts: number;















  nextRetryAt?: number;















  canceled?: boolean;















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







type MobileFilesSection = "browser" | "preview" | "manage";







type PreviewMode = "open" | "expanded" | "hidden";







type ColumnFilterKey = "createdAt" | "author" | "table" | "action" | "field" | "before" | "after";















const FILES_PREVIEW_MODE_STORAGE_KEY = "rn-gestor.files.preview-mode";







const FILES_ACTIVE_FOLDER_STORAGE_KEY = "rn-gestor.files.active-folder-id";







const FILES_SELECTED_FILE_STORAGE_KEY = "rn-gestor.files.selected-file-id";







const BASE_UPLOAD_RETRY_DELAY_MS = 1_500;







const MAX_UPLOAD_RETRY_DELAY_MS = 30_000;







const MAX_UPLOAD_ATTEMPTS = 5;























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















function createLocalId() {







  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {







    return crypto.randomUUID();







  }















  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;







}















function splitFilesIntoUploadBatches(files: File[]) {







  const batches: File[][] = [];







  let currentBatch: File[] = [];







  let currentBatchBytes = 0;















  for (const file of files) {







    const nextBatchWouldOverflowCount = currentBatch.length >= MAX_FILE_UPLOAD_COUNT;







    const nextBatchWouldOverflowBytes =







      currentBatch.length > 0 && currentBatchBytes + file.size > MAX_FILE_UPLOAD_BATCH_BYTES;















    if (nextBatchWouldOverflowCount || nextBatchWouldOverflowBytes) {







      batches.push(currentBatch);







      currentBatch = [];







      currentBatchBytes = 0;







    }















    currentBatch.push(file);







    currentBatchBytes += file.size;







  }















  if (currentBatch.length > 0) {







    batches.push(currentBatch);







  }















  return batches;







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















export function FileManagerWorkspace({ actor, accessToken, devRole }: FileManagerWorkspaceProps) {







  const canManage = actor.role === "ADMINISTRADOR";







  const fileInputRef = useRef<HTMLInputElement | null>(null);







  const uploadSectionRef = useRef<HTMLElement | null>(null);







  const activeFolderIdRef = useRef<string | null>(null);







  const restoredFolderIdRef = useRef<string | null>(null);







  const uploadQueueRef = useRef<PendingUploadBatch[]>([]);







  const pendingUploadsRef = useRef<PendingUploadItem[]>([]);
  const currentUploadingBatchRef = useRef<PendingUploadBatch | null>(null);






  const uploadProcessingRef = useRef(false);







  const uploadAbortControllerRef = useRef<AbortController | null>(null);







  const uploadPausedRef = useRef(false);















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







  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);







  const [previewText, setPreviewText] = useState<string>("");







  const [previewLoading, setPreviewLoading] = useState(false);







  const [viewMode, setViewMode] = useState<ViewMode>("medium");







  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);







  const [renameFileName, setRenameFileName] = useState("");







  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);







  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);







  const [activeUploadDropzone, setActiveUploadDropzone] = useState(false);







  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([]);







  const [queuedUploadsCount, setQueuedUploadsCount] = useState(0);







  const [uploadPaused, setUploadPaused] = useState(false);
  useEffect(() => {
    uploadPausedRef.current = uploadPaused;
  }, [uploadPaused]);














  const [openColumnFilter, setOpenColumnFilter] = useState<ColumnFilterKey | null>(null);







  const [previewMode, setPreviewMode] = useState<PreviewMode>("open");







  const [fileDateFrom, setFileDateFrom] = useState("");







  const [fileDateTo, setFileDateTo] = useState("");







  const [mobileSection, setMobileSection] = useState<MobileFilesSection>("browser");







  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);







  const [mobileExplorerCollapsed, setMobileExplorerCollapsed] = useState(true);















  const uploadBusy = pendingUploads.length > 0 || queuedUploadsCount > 0;







  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);







  const folderOptions = useMemo(() => flattenFolderOptions(folderTree), [folderTree]);







  const rootFolders = folderTree;







  const activePendingUploads = pendingUploads.filter((item) => item.folderId === activeFolderId);







  const filteredChildFolders = useMemo(







    () =>







      activeFolder







        ? activeFolder.childFolders.filter((folder) => {







            const matchesQuery = folder.name.toLowerCase().includes(fileQuery.trim().toLowerCase());







            if (!matchesQuery) return false;







            return isWithinDateRange(folder.updatedAt, fileDateFrom, fileDateTo);







          })







        : [],







    [activeFolder, fileDateFrom, fileDateTo, fileQuery]







  );







  const filteredFiles = useMemo(







    () =>







      activeFolder







        ? activeFolder.files.filter((file) => {







            const matchesQuery = file.fileName.toLowerCase().includes(fileQuery.trim().toLowerCase());







            if (!matchesQuery) return false;







            return isWithinDateRange(file.updatedAt, fileDateFrom, fileDateTo);







          })







        : [],







    [activeFolder, fileDateFrom, fileDateTo, fileQuery]







  );







  const selectedFileIdSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds]);







  const useDirectoryListing = (activeFolder?.childFolders.length ?? 0) > 0;







  const selectedFile = filteredFiles.find((file) => file.id === selectedFileId) ?? filteredFiles[0] ?? null;







  const selectedPreviewKind = getFilePreviewKind(selectedFile?.mimeType, selectedFile?.fileName);







  const activeRootFolderId = activeFolder?.breadcrumb[0]?.id ?? activeFolder?.folder.id ?? null;







  const totalVisibleItems = filteredChildFolders.length + filteredFiles.length + activePendingUploads.length;







  const selectedFolderDepth = Math.max((activeFolder?.breadcrumb.length ?? 1) - 1, 0);







  const hiddenItemsCount =







    activeFolder ? activeFolder.childFolders.length + activeFolder.files.length - filteredChildFolders.length - filteredFiles.length : 0;







  const mobileManageBadge = Number(Boolean(createPanel || settingsOpen)) + queuedUploadsCount;







  const selectedVisibleFiles = useMemo(







    () => filteredFiles.filter((file) => selectedFileIdSet.has(file.id)),







    [filteredFiles, selectedFileIdSet]







  );







  const allVisibleFilesSelected = filteredFiles.length > 0 && selectedVisibleFiles.length === filteredFiles.length;















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







    if (!selectedFileId || !filteredFiles.some((file) => file.id === selectedFileId)) {







      setSelectedFileId(filteredFiles[0]?.id ?? null);







    }







  }, [filteredFiles, selectedFileId]);















  useEffect(() => {







    const visibleFileIds = new Set(filteredFiles.map((file) => file.id));







    setSelectedFileIds((current) => {







      const next = current.filter((fileId) => visibleFileIds.has(fileId));







      return next.length === current.length ? current : next;







    });







  }, [filteredFiles]);















  useEffect(() => {







    if (typeof window === "undefined") return;















    const storedPreviewMode = window.localStorage.getItem(FILES_PREVIEW_MODE_STORAGE_KEY);







    const storedFolderId = window.localStorage.getItem(FILES_ACTIVE_FOLDER_STORAGE_KEY);







    const storedSelectedFileId = window.localStorage.getItem(FILES_SELECTED_FILE_STORAGE_KEY);















    if (storedPreviewMode === "open" || storedPreviewMode === "expanded" || storedPreviewMode === "hidden") {







      setPreviewMode(storedPreviewMode);







    }















    restoredFolderIdRef.current = storedFolderId || null;







    if (storedSelectedFileId) {







      setSelectedFileId(storedSelectedFileId);







    }







  }, []);















  useEffect(() => {







    if (typeof window === "undefined") return;







    window.localStorage.setItem(FILES_PREVIEW_MODE_STORAGE_KEY, previewMode);







  }, [previewMode]);















  useEffect(() => {







    if (typeof window === "undefined") return;















    if (activeFolderId) {







      window.localStorage.setItem(FILES_ACTIVE_FOLDER_STORAGE_KEY, activeFolderId);







      return;







    }















    window.localStorage.removeItem(FILES_ACTIVE_FOLDER_STORAGE_KEY);







  }, [activeFolderId]);















  useEffect(() => {







    if (typeof window === "undefined") return;















    if (selectedFileId) {







      window.localStorage.setItem(FILES_SELECTED_FILE_STORAGE_KEY, selectedFileId);







      return;







    }















    window.localStorage.removeItem(FILES_SELECTED_FILE_STORAGE_KEY);







  }, [selectedFileId]);















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







        const preferred = preferredFolderId ?? current ?? restoredFolderIdRef.current;







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















  useEffect(() => {







    setMobileSection("browser");







  }, [activeFolderId]);















  useEffect(() => {







    const nextExpandedIds = new Set(rootFolders.map((folder) => folder.id));







    for (const folder of activeFolder?.breadcrumb ?? []) {







      nextExpandedIds.add(folder.id);







    }















    setExpandedFolderIds((current) => {







      const next = new Set(current);







      let changed = false;















      for (const folderId of nextExpandedIds) {







        if (next.has(folderId)) continue;







        next.add(folderId);







        changed = true;







      }















      return changed ? Array.from(next) : current;







    });







  }, [activeFolder, rootFolders]);















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
      if (uploadPausedRef.current) {
        break;
      }






      const batch = uploadQueueRef.current[0];







      if (!batch) break;















      setQueuedUploadsCount(uploadQueueRef.current.length);







      updatePendingUploadStatus(batch.pendingIds, "uploading");
      const controller = new AbortController();
      uploadAbortControllerRef.current = controller;
      currentUploadingBatchRef.current = batch;






      setError(null);















      try {







                const metas = batch.files.map((file) => ({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size
        }));
        const prepared = await prepareFolderUploads(batch.folderId, metas, { accessToken, devRole });
        const entries = prepared.entries;
        for (let i = 0; i < batch.files.length; i++) {
          const file = batch.files[i];
          const plan = entries[i];
          if (!plan) throw new Error("Plano de upload incompleto");
          const res = await fetch(plan.signedUrl, {
            method: "PUT",
            headers: {
              "content-type": plan.mimeType,
              "x-upsert": "false"
            },
            body: file,
            signal: controller.signal
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(txt || `Falha no upload de ${file.name}`);
          }
        }
        await finalizeFolderUploads(
          batch.folderId,
          entries.map((e) => ({
            fileId: e.fileId,
            fileName: e.fileName,
            mimeType: e.mimeType,
            sizeBytes: e.sizeBytes,
            storagePath: e.storagePath
          })),
          { accessToken, devRole }
        );






        await loadFolders(batch.folderId);















        if (activeFolderIdRef.current === batch.folderId) {







          await loadActiveFolder(batch.folderId);







        }















        setInfo(`${batch.files.length} arquivo(s) enviado(s) com sucesso.`);







      } catch (nextError) {







        {
          const err = (nextError ?? {}) as { status?: number; code?: string; message?: unknown };
          const aborted = err && typeof err === "object" && err.status === 408 && err.code === "REQUEST_TIMEOUT";
          if (aborted) {
            updatePendingUploadStatus(batch.pendingIds, "canceled");
            removePendingUploads(batch.pendingIds);
            setInfo("Upload cancelado.");
          } else {
            const nextAttempts = (batch.attempts ?? 0) + 1;
            const delay = Math.min(
              BASE_UPLOAD_RETRY_DELAY_MS * Math.pow(2, Math.max(0, nextAttempts - 1)),
              MAX_UPLOAD_RETRY_DELAY_MS
            );
            if (nextAttempts < MAX_UPLOAD_ATTEMPTS) {
              updatePendingUploadStatus(batch.pendingIds, "queued");
              if (uploadQueueRef.current.length <= 1) {
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
              uploadQueueRef.current.push({ ...batch, attempts: nextAttempts });
              setError(err?.message ? String(err.message) : "Falha ao enviar arquivos. Repetindo...");
            } else {
              updatePendingUploadStatus(batch.pendingIds, "failed");
              setError(err?.message ? String(err.message) : "Falha ao enviar arquivos apos multiplas tentativas.");
            }
          }
        }






      } finally {







        uploadAbortControllerRef.current = null;
        currentUploadingBatchRef.current = null;
        uploadQueueRef.current.shift();






        setQueuedUploadsCount(uploadQueueRef.current.length);







        const wasRequeued = uploadQueueRef.current.find((b) => b.id === batch.id && b.attempts > batch.attempts);
        if (!wasRequeued) {
          removePendingUploads(batch.pendingIds);
        }






      }







    }















    uploadProcessingRef.current = false;







  }, [accessToken, devRole, loadActiveFolder, loadFolders, removePendingUploads, updatePendingUploadStatus]);

  // Upload controls
  const pauseUploads = useCallback(() => {
    setUploadPaused(true);
  }, []);

  const resumeUploads = useCallback(() => {
    setUploadPaused(false);
    if (uploadQueueRef.current.length > 0 && !uploadProcessingRef.current) {
      void processUploadQueue();
    }
  }, [processUploadQueue]);

  const cancelQueuedUploads = useCallback(() => {
    const queue = uploadQueueRef.current;
    if (queue.length === 0) return;
    const toCancel = queue.slice(uploadProcessingRef.current ? 1 : 0);
    const pendingIds = toCancel.flatMap((b) => b.pendingIds);
    uploadQueueRef.current = queue.slice(0, uploadProcessingRef.current ? 1 : 0);
    setQueuedUploadsCount(uploadQueueRef.current.length);
    updatePendingUploadStatus(pendingIds, "canceled");
    removePendingUploads(pendingIds);
    setInfo("Lotes em fila cancelados.");
  }, [removePendingUploads, updatePendingUploadStatus, setInfo]);

  const cancelAllUploads = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    const current = currentUploadingBatchRef.current;
    const queued = uploadQueueRef.current;
    const pendingIds = [
      ...(current?.pendingIds ?? []),
      ...queued.flatMap((b) => b.pendingIds)
    ];
    if (controller) {
      try {
        controller.abort();
      } catch {}
    }
    uploadQueueRef.current = [];
    setQueuedUploadsCount(0);
    updatePendingUploadStatus(pendingIds, "canceled");
    removePendingUploads(pendingIds);
    setUploadPaused(false);
    setInfo("Upload cancelado para todos os lotes.");
  }, [removePendingUploads, updatePendingUploadStatus, setInfo]);














  function openCreatePanel(parentFolderId: string | null) {







    setCreatePanel({ parentFolderId });







    setCreateName("");







    setCreateDescription("");







    setCreateParentFolderId(parentFolderId ?? "");







    setMobileSection("manage");







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







    setActiveUploadDropzone(false);







    navigateToFolder(folderId);















    const batches = splitFilesIntoUploadBatches(files);







    const pendingBatches = batches.map((batchFiles) => {







      const createdAt = new Date().toISOString();







      const batchId = createLocalId();







      const pendingItems: PendingUploadItem[] = batchFiles.map((file) => ({







        id: createLocalId(),







        batchId,







        folderId,







        fileName: file.name,







        file,







        mimeType: file.type || "application/octet-stream",







        sizeBytes: file.size,







        previewUrl: isPreviewableFile(file.type, file.name) ? URL.createObjectURL(file) : null,







        createdAt,







        status: "queued",







        attempts: 0,







        errorMessage: null







      }));















      return {







        id: batchId,







        folderId,







        files: batchFiles,







        pendingIds: pendingItems.map((item) => item.id),







        pendingItems,







        attempts: 0







      };







    });















    setPendingUploads((current) => [...pendingBatches.flatMap((batch) => batch.pendingItems), ...current]);







    uploadQueueRef.current.push(







      ...pendingBatches.map((batch) => ({







        id: batch.id,







        folderId: batch.folderId,







        files: batch.files,







        pendingIds: batch.pendingIds,







        attempts: batch.attempts







      }))







    );







    setQueuedUploadsCount(uploadQueueRef.current.length);















    if (fileInputRef.current) {







      fileInputRef.current.value = "";







    }















    setInfo(







      batches.length > 1







        ? `${files.length} arquivo(s) adicionados em ${batches.length} lote(s) para upload.`







        : `${files.length} arquivo(s) adicionados para upload.`







    );















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







      setSelectedFileIds((current) => current.filter((currentFileId) => currentFileId !== fileId));







      await loadActiveFolder(activeFolder.folder.id);







      await loadFolders(activeFolder.folder.id);







    } catch (nextError) {







      setError(nextError instanceof Error ? nextError.message : "Falha ao excluir arquivo.");







    } finally {







      setSubmitting(false);







    }







  }















  async function handleDeleteSelectedFiles() {







    if (!canManage || !activeFolder || submitting || selectedVisibleFiles.length === 0) return;















    const confirmed = window.confirm(`Excluir ${selectedVisibleFiles.length} arquivo(s) selecionado(s)?`);







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







        setError(`Alguns arquivos nao puderam ser excluidos: ${failedFileNames.slice(0, 3).join(", ")}${failedFileNames.length > 3 ? "..." : ""}`);







      } else {







        setInfo(`${selectedVisibleFiles.length} arquivo(s) excluido(s) com sucesso.`);







      }







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







      navigateToFolder(folderId);







      void handleUpload(event.dataTransfer.files, folderId);







    }







  }















  function navigateToFolder(folderId: string) {







    setActiveFolderId(folderId);







    setMobileSection("browser");







    setMobileExplorerCollapsed(true);







  }















  function handleSelectFile(fileId: string) {







    setSelectedFileId(fileId);







    setPreviewMode((current) => (current === "hidden" ? "open" : current));







    setMobileSection("preview");







  }















  function toggleFileSelection(fileId: string) {







    setSelectedFileIds((current) =>







      current.includes(fileId) ? current.filter((currentFileId) => currentFileId !== fileId) : [...current, fileId]







    );







  }















  function toggleSelectAllVisibleFiles() {







    if (allVisibleFilesSelected) {







      setSelectedFileIds([]);







      return;







    }















    setSelectedFileIds(filteredFiles.map((file) => file.id));







  }















  function handleOpenManageSection() {







    setMobileSection("manage");







  }















  function handleOpenUploadSection() {







    setMobileSection("manage");







    setSettingsOpen(false);















    window.requestAnimationFrame(() => {







      uploadSectionRef.current?.scrollIntoView({







        behavior: "smooth",







        block: "start"







      });







    });







  }















  function clearFileFilters() {







    setFileQuery("");







    setFileDateFrom("");







    setFileDateTo("");







  }















  function toggleFolderTreeNode(folderId: string) {







    setExpandedFolderIds((current) =>







      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]







    );







  }















  function renderFolderTreeNode(folder: FolderTreeNode, depth = 0): ReactNode {







    const isExpanded = expandedFolderIds.includes(folder.id);







    const hasChildren = folder.children.length > 0;















    return (







      <div key={folder.id} className="files-tree-node">







        <div className={`files-tree-row ${activeFolderId === folder.id ? "is-active" : ""}`} style={{ marginLeft: depth * 14 }}>







          <button







            type="button"







            className="files-tree-toggle"







            onClick={() => toggleFolderTreeNode(folder.id)}







            disabled={!hasChildren}







            aria-label={hasChildren ? (isExpanded ? "Recolher pasta" : "Expandir pasta") : "Pasta sem subpastas"}







          >







            {hasChildren ? (isExpanded ? "-" : "+") : "*"}







          </button>







          <button







            type="button"







            className={`files-tree-folder ${folderDropTargetId === folder.id ? "is-upload-target" : ""}`}







            onClick={() => navigateToFolder(folder.id)}







            onDragOver={(event) => {







              if (!canManage || !Array.from(event.dataTransfer.types).includes("Files")) return;







              event.preventDefault();







              setFolderDropTargetId(folder.id);







            }}







            onDragLeave={() => {







              if (folderDropTargetId === folder.id) setFolderDropTargetId(null);







            }}







            onDrop={(event) => handleFolderFileDrop(folder.id, event)}







          >







            <div className="files-tree-folder-main">







              <strong>{folder.name}</strong>







              <small>







                {folder.fileCount} arquivo(s) - {folder.childFolderCount} pasta(s)







              </small>







            </div>







          </button>







        </div>







        {hasChildren && isExpanded ? (







          <div className="files-tree-children">{folder.children.map((child) => renderFolderTreeNode(child, depth + 1))}</div>







        ) : null}







      </div>







    );







  }















  function handleActiveUploadDragOver(event: DragEvent<HTMLElement>) {







    if (!canManage || !activeFolder) return;







    if (!Array.from(event.dataTransfer.types).includes("Files")) return;







    event.preventDefault();







    event.dataTransfer.dropEffect = "copy";







    setActiveUploadDropzone(true);







  }















  function handleActiveUploadDragLeave(event: DragEvent<HTMLElement>) {







    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;







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















  function renderDirectoryFolderItem(folder: FileFolderSummary) {







    return (







      <article







        key={folder.id}







        className={`files-list-row files-directory-row is-folder ${activeFolderId === folder.id ? "is-selected" : ""}`}







      >







        <button







          type="button"







          className={`files-directory-link ${folderDropTargetId === folder.id ? "is-upload-target" : ""}`}







          onClick={() => navigateToFolder(folder.id)}







          onDragOver={(event) => {







            if (!canManage || !Array.from(event.dataTransfer.types).includes("Files")) return;







            event.preventDefault();







            setFolderDropTargetId(folder.id);







          }}







          onDragLeave={() => {







            if (folderDropTargetId === folder.id) setFolderDropTargetId(null);







          }}







          onDrop={(event) => handleFolderFileDrop(folder.id, event)}







        >







          <div className="files-thumb files-thumb-small files-thumb-folder">







            <strong>DIR</strong>







          </div>







          <div className="files-list-main">







            <strong title={folder.name}>{folder.name}</strong>







            <div className="files-list-meta">







              <span>{folder.fileCount} arquivo(s)</span>







              <span>{folder.childFolderCount} pasta(s)</span>







              <span>{formatDateTime(folder.updatedAt)}</span>







            </div>







          </div>







        </button>







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







        onClick={() => handleSelectFile(file.id)}







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







        className={`files-list-row ${selectedFileId === file.id ? "is-selected" : ""} ${canManage ? "has-selection" : ""}`}







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







          void handleDropReorder(file.id);







        }}







      >







        {canManage ? (







          <label className="files-item-select" onClick={(event) => event.stopPropagation()}>







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

              {canManage ? (
                <>
                  <button
                    type="button"
                    className="files-ghost-btn"
                    onClick={uploadPaused ? resumeUploads : pauseUploads}
                    disabled={pendingUploads.length === 0 && queuedUploadsCount === 0}
                    title={uploadPaused ? "Retomar upload" : "Pausar upload"}
                  >
                    {uploadPaused ? "Retomar upload" : "Pausar upload"}
                  </button>
                  <button
                    type="button"
                    className="files-ghost-btn"
                    onClick={cancelQueuedUploads}
                    disabled={queuedUploadsCount === 0}
                    title="Cancelar arquivos em fila"
                  >
                    Cancelar pendentes
                  </button>
                  <button
                    type="button"
                    className="files-ghost-btn"
                    onClick={cancelAllUploads}
                    disabled={pendingUploads.length === 0 && queuedUploadsCount === 0}
                    title="Cancelar todos os uploads"
                  >
                    Cancelar tudo
                  </button>
                </>
              ) : null}





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







        className={`files-large-item ${selectedFileId === file.id ? "is-selected" : ""} ${canManage ? "has-selection" : ""}`}







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







          void handleDropReorder(file.id);







        }}







      >







        {canManage ? (







          <label className="files-item-select" onClick={(event) => event.stopPropagation()}>







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







            <button type="button" className="files-ghost-btn" onClick={() => handleSelectFile(file.id)}>







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















  function renderPreviewSection(className?: string) {







    if (previewMode === "hidden") {







      return null;







    }















    return (







      <section className={`files-side-card files-preview-shell files-mobile-panel ${className ?? ""}`.trim()}>







        <div className="files-section-head">







          <div>







            <span className="files-section-kicker">Preview</span>







            <strong>{selectedFile ? "Arquivo selecionado" : "Nenhum arquivo"}</strong>







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







                onClick={() => setPreviewMode((current) => (current === "expanded" ? "open" : "expanded"))}







              >







                {previewMode === "expanded" ? "Compactar" : "Expandir"}







              </button>







            </div>







          ) : null}







        </div>















        <div className={`files-preview-panel ${previewMode === "expanded" ? "is-expanded" : ""}`}>







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







                        setMobileSection("browser");







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







        </div>







      </section>







    );







  }















  function renderManageSection(className?: string) {







    return (







      <div className={`files-manage-stack files-mobile-panel ${className ?? ""}`.trim()}>







        <div className="files-management-grid">







          <section className="files-side-card files-folder-summary-card">







            <div className="files-section-head">







              <div>







                <span className="files-section-kicker">Resumo</span>







                <strong>{activeFolder?.folder.name}</strong>







              </div>







              {canManage ? (







                <button type="button" className="files-ghost-btn" onClick={() => setSettingsOpen((current) => !current)}>







                  {settingsOpen ? "Fechar ajustes" : "Ajustes"}







                </button>







              ) : null}







            </div>







            <p className="files-meta-line">







              {activeFolder?.folder.description?.trim() || "Pasta pronta para operacoes rapidas do dia a dia."}







            </p>







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







                  {activeFolder ? new Date(activeFolder.folder.updatedAt).toLocaleDateString("pt-BR") : "--"}







                </strong>







              </article>







            </div>







          </section>















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







                {queuedUploadsCount > 0 ? <span className="files-inline-note">{queuedUploadsCount} lote(s)</span> : null}







              </div>







              <p className="files-meta-line">







                Use este bloco como ponto principal de envio. Arraste arquivos para ca ou abra o seletor.







              </p>







              <div className="files-inline-actions">







                <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>







                  Selecionar arquivos







                </button>







                <small>







                  Até {MAX_FILE_UPLOAD_COUNT} arquivos por vez. Se passar de {Math.round(MAX_FILE_UPLOAD_BATCH_BYTES / (1024 * 1024))} MB,







                  o sistema divide em lotes automaticamente.







                </small>







              </div>







            </section>







          ) : null}















          {createPanel ? (







            <form className="files-action-panel files-side-card" onSubmit={handleCreateFolder}>







              <div className="files-panel-head">







                <div>







                  <span className="files-section-kicker">Criar</span>







                  <strong>{createPanel.parentFolderId ? "Nova subpasta" : "Nova pasta"}</strong>







                </div>







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







              <textarea







                value={createDescription}







                onChange={(event) => setCreateDescription(event.target.value)}







                rows={3}







                placeholder="Descricao"







              />







              <button type="submit" className="btn" disabled={submitting}>







                {submitting ? "Salvando..." : "Criar pasta"}







              </button>







            </form>







          ) : null}















          {settingsOpen && canManage ? (







            <form className="files-action-panel files-side-card" onSubmit={handleUpdateFolder}>







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







              <select value={editParentFolderId} onChange={(event) => setEditParentFolderId(event.target.value)}>







                <option value="">Sem pasta pai</option>







                {folderOptions







                  .filter((option) => option.id !== activeFolder?.folder.id)







                  .map((option) => (







                    <option key={option.id} value={option.id}>







                      {option.label}







                    </option>







                  ))}







              </select>







              <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nome" />







              <textarea







                value={editDescription}







                onChange={(event) => setEditDescription(event.target.value)}







                rows={3}







                placeholder="Descricao"







              />







              <button type="submit" className="btn" disabled={submitting}>







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







        <header className="files-dashboard-bar files-command-bar">







          <div className="files-dashboard-head files-command-copy">







            {activeFolder ? (







              <div className="files-path">







                {activeFolder.breadcrumb.map((folder, index) => (







                  <span key={folder.id}>







                    <button type="button" className="files-path-link" onClick={() => navigateToFolder(folder.id)}>







                      {folder.name}







                    </button>







                    {index < activeFolder.breadcrumb.length - 1 ? " / " : ""}







                  </span>







                ))}







              </div>







            ) : null}







            <div className="files-command-title-row">







              <div className="files-command-title">







                <span className="files-section-kicker">{activeFolder ? "Pasta ativa" : "Central de arquivos"}</span>







                <h1>{activeFolder?.folder.name ?? "Arquivos"}</h1>







                {activeFolder ? (







                  <p className="files-meta-line">







                    {activeFolder.folder.description?.trim()







                      ? activeFolder.folder.description







                      : "Navegue, faca upload e resolva arquivos sem abrir varios paineis ao mesmo tempo."}







                  </p>







                ) : (







                  <p className="files-meta-line">Escolha uma pasta para comecar a trabalhar.</p>







                )}







              </div>







              {activeFolder ? (







                <div className="files-mini-stats">







                  <span>{activeFolder.files.length} arquivo(s)</span>







                  <span>{activeFolder.childFolders.length} pasta(s)</span>







                  <span>Nivel {selectedFolderDepth + 1}</span>







                  {uploadBusy ? <span>{pendingUploads.length} envio(s)</span> : null}







                </div>







              ) : null}







            </div>







          </div>







          <div className="files-command-actions">







            {canManage ? (







              <button type="button" className="btn" onClick={() => openCreatePanel(activeFolder?.folder.id ?? null)}>







                {activeFolder ? "Nova subpasta" : "Nova pasta"}







              </button>







            ) : null}







            {canManage && activeFolder ? (







              <button type="button" className="files-ghost-btn" onClick={handleOpenUploadSection}>







                Ir para upload







              </button>







            ) : null}







            {activeFolder ? (







              <button type="button" className="files-ghost-btn" onClick={() => void handleDownloadAll()} disabled={activeFolder.files.length === 0 || downloadAllPending}>







                {downloadAllPending ? "Baixando..." : "Baixar pasta"}







              </button>







            ) : null}







            <button type="button" className="files-ghost-btn" onClick={() => void loadFolders(activeFolderId)} disabled={foldersLoading}>







              Atualizar







            </button>







            {canManage && activeFolder ? (







              <button type="button" className="files-ghost-btn" onClick={handleOpenManageSection}>







                Gerir pasta







              </button>







            ) : null}







            <input ref={fileInputRef} type="file" multiple hidden onChange={handleUploadInputChange} />







          </div>







        </header>















        {error ? <p className="files-feedback is-error">{error}</p> : null}







        {info ? <p className="files-feedback is-info">{info}</p> : null}















        {activeFolder ? (







          <section className="files-mobile-switcher" aria-label="Secoes do workspace de arquivos">







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







              {mobileManageBadge > 0 ? <small>{mobileManageBadge}</small> : null}







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







            <aside className={`files-workspace-column files-explorer-column ${mobileSection !== "browser" ? "is-mobile-hidden" : ""}`}>







              <section className={`files-side-card files-explorer-card ${mobileExplorerCollapsed ? "is-collapsed-mobile" : ""}`}>







                <div className="files-section-head">







                  <div>







                    <span className="files-section-kicker">Explorar</span>







                    <strong>Pastas</strong>







                  </div>







                  <div className="files-toolbar-group">







                    <button







                      type="button"







                      className="files-ghost-btn files-mobile-only"







                      onClick={() => setMobileExplorerCollapsed((current) => !current)}







                    >







                      {mobileExplorerCollapsed ? "Abrir menu" : "Fechar menu"}







                    </button>







                    {canManage ? (







                      <button type="button" className="files-ghost-btn" onClick={() => openCreatePanel(activeRootFolderId)}>







                        Nova pasta







                      </button>







                    ) : null}







                  </div>







                </div>







                <p className="files-meta-line">







                  {folders.length} pasta(s) disponivel(is)







                </p>







                <div className="files-folder-tree-list">







                  {foldersLoading ? <p className="files-inline-note">Carregando pastas...</p> : folderTree.map((folder) => renderFolderTreeNode(folder))}







                </div>







              </section>







            </aside>















            <div className="files-workspace-column files-browser-column files-main-column">







              <section







                className={`files-main-toolbar files-main-toolbar-compact files-mobile-panel ${mobileSection !== "browser" ? "is-mobile-hidden" : ""}`}







              >







                <div className="files-filter-group files-filter-group-primary">







                  <input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Buscar arquivos e pastas..." />







                  <label className="files-date-filter">







                    <span>De</span>







                    <input type="date" value={fileDateFrom} onChange={(event) => setFileDateFrom(event.target.value)} />







                  </label>







                  <label className="files-date-filter">







                    <span>Ate</span>







                    <input type="date" value={fileDateTo} onChange={(event) => setFileDateTo(event.target.value)} />







                  </label>







                </div>







                <div className="files-toolbar-group files-toolbar-group-secondary">







                  {canManage && filteredFiles.length > 0 ? (







                    <>







                      <button type="button" className="files-ghost-btn" onClick={toggleSelectAllVisibleFiles}>







                        {allVisibleFilesSelected ? "Limpar selecao" : "Selecionar visiveis"}







                      </button>







                      {selectedVisibleFiles.length > 0 ? <span className="files-inline-note">{selectedVisibleFiles.length} selecionado(s)</span> : null}







                      {selectedVisibleFiles.length > 0 ? (







                        <button type="button" className="files-danger-btn" onClick={() => void handleDeleteSelectedFiles()} disabled={submitting}>







                          Excluir selecionados







                        </button>







                      ) : null}







                    </>







                  ) : null}







                  {fileQuery || fileDateFrom || fileDateTo ? (







                    <button type="button" className="files-ghost-btn" onClick={clearFileFilters}>







                      Limpar filtros







                    </button>







                  ) : null}







                  {selectedFile ? (







                    <button







                      type="button"







                      className="files-ghost-btn"







                      onClick={() => {







                        const nextPreviewMode = previewMode === "hidden" ? "open" : "hidden";







                        setPreviewMode(nextPreviewMode);







                        setMobileSection(nextPreviewMode === "hidden" ? "browser" : "preview");







                      }}







                    >







                      {previewMode === "hidden" ? "Abrir preview" : "Ocultar preview"}







                    </button>







                  ) : null}







                  {!useDirectoryListing ? (







                    <div className="files-view-modes">







                      <button type="button" className={viewMode === "compact" ? "is-active" : ""} onClick={() => setViewMode("compact")}>







                        Compacto







                      </button>







                      <button type="button" className={viewMode === "medium" ? "is-active" : ""} onClick={() => setViewMode("medium")}>







                        Lista







                      </button>







                      <button type="button" className={viewMode === "large" ? "is-active" : ""} onClick={() => setViewMode("large")}>







                        Cards







                      </button>







                    </div>







                  ) : (







                    <span className="files-inline-note">Modo diretorio</span>







                  )}







                </div>







              </section>















              {activeFolder.childFolders.length > 0 ? (







                <section className={`files-subfolders-strip files-mobile-panel ${mobileSection !== "browser" ? "is-mobile-hidden" : ""}`}>







                  {activeFolder.childFolders.map((folder) => (







                    <button







                      key={folder.id}







                      type="button"







                      className={`files-subfolder-chip ${activeFolderId === folder.id ? "is-active" : ""}`}







                      onClick={() => navigateToFolder(folder.id)}







                    >







                      {folder.name}







                    </button>







                  ))}







                </section>







              ) : null}















              {renderPreviewSection(mobileSection !== "preview" ? "is-mobile-hidden" : "")}















              <section className={`files-list-panel files-mobile-panel ${mobileSection !== "browser" ? "is-mobile-hidden" : ""}`}>







                <div className="files-list-panel-head">







                  <div>







                    <strong>Conteudo da pasta</strong>







                    <p className="files-meta-line">







                      {totalVisibleItems} item(ns) visivel(is)







                      {hiddenItemsCount > 0 ? ` - ${hiddenItemsCount} oculto(s) por filtro` : ""}







                    </p>







                  </div>







                  <div className="files-mini-stats">







                    {activePendingUploads.length > 0 ? <span>{activePendingUploads.length} em envio</span> : null}







                    <span>{useDirectoryListing ? "Diretorio" : viewMode === "medium" ? "Lista" : viewMode === "large" ? "Cards" : "Compacto"}</span>







                  </div>







                </div>















                {folderLoading ? <p className="files-inline-note">Carregando...</p> : null}







                {!folderLoading && filteredChildFolders.length === 0 && filteredFiles.length === 0 && activePendingUploads.length === 0 ? (







                  <p className="files-inline-note">{fileQuery ? "Nada encontrado." : "Sem itens neste diretorio."}</p>







                ) : null}















                {useDirectoryListing ? (







                  <div className="files-list-stack files-directory-list">







                    {filteredChildFolders.map((folder) => renderDirectoryFolderItem(folder))}







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















                {!useDirectoryListing && viewMode === "compact" ? (







                  <div className="files-compact-grid">







                    {filteredFiles.map((file) => renderCompactItem(file))}







                  </div>







                ) : null}















                {!useDirectoryListing && viewMode === "medium" ? (







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















                {!useDirectoryListing && viewMode === "large" ? (







                  <div className="files-large-list">







                    {filteredFiles.map((file) => renderLargeItem(file))}







                  </div>







                ) : null}







              </section>















              {renderManageSection(mobileSection !== "manage" ? "is-mobile-hidden" : "")}







            </div>







          </div>







        ) : null}







      </section>







    </main>







  );







}












