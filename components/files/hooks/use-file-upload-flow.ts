import { useCallback, useEffect, useRef, useState } from "react";

import {
  finalizeFolderUploads,
  prepareFolderUploads,
} from "@/components/files/api";
import type {
  PendingUploadBatch,
  PendingUploadItem,
} from "@/components/files/upload-types";
import type { Role } from "@/components/ui-grid/types";
import {
  MAX_FILE_UPLOAD_BATCH_BYTES,
  MAX_FILE_UPLOAD_COUNT,
  isPreviewableFile,
} from "@/lib/files/shared";

const BASE_UPLOAD_RETRY_DELAY_MS = 1_500;
const MAX_UPLOAD_RETRY_DELAY_MS = 30_000;
const MAX_UPLOAD_ATTEMPTS = 5;

type UseFileUploadFlowParams = {
  accessToken: string | null;
  devRole?: Role | null;
  loadFolders: (preferredFolderId?: string | null) => Promise<void>;
  loadActiveFolder: (folderId: string) => Promise<void>;
  getActiveFolderId: () => string | null;
  onNavigateToFolder?: (folderId: string) => void;
  setError: (message: string | null) => void;
  setInfo: (message: string | null) => void;
};

function createLocalId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function splitFilesIntoUploadBatches(files: File[]) {
  const batches: File[][] = [];
  let currentBatch: File[] = [];
  let currentBatchBytes = 0;

  for (const file of files) {
    const nextBatchWouldOverflowCount =
      currentBatch.length >= MAX_FILE_UPLOAD_COUNT;
    const nextBatchWouldOverflowBytes =
      currentBatch.length > 0 &&
      currentBatchBytes + file.size > MAX_FILE_UPLOAD_BATCH_BYTES;

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

function getErrorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? fallback)
    : fallback;
}

export function useFileUploadFlow({
  accessToken,
  devRole,
  loadFolders,
  loadActiveFolder,
  getActiveFolderId,
  onNavigateToFolder,
  setError,
  setInfo,
}: UseFileUploadFlowParams) {
  const uploadQueueRef = useRef<PendingUploadBatch[]>([]);
  const pendingUploadsRef = useRef<PendingUploadItem[]>([]);
  const currentUploadingBatchRef = useRef<PendingUploadBatch | null>(null);
  const uploadProcessingRef = useRef(false);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadPausedRef = useRef(false);

  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([]);
  const [queuedUploadsCount, setQueuedUploadsCount] = useState(0);
  const [uploadPaused, setUploadPaused] = useState(false);

  useEffect(() => {
    uploadPausedRef.current = uploadPaused;
  }, [uploadPaused]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const removePendingUploads = useCallback((pendingIds: string[]) => {
    const pendingIdSet = new Set(pendingIds);

    setPendingUploads((current) => {
      const next: PendingUploadItem[] = [];
      for (const item of current) {
        if (pendingIdSet.has(item.id)) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          continue;
        }
        next.push(item);
      }
      return next;
    });
  }, []);

  const updatePendingUploadStatus = useCallback(
    (pendingIds: string[], status: PendingUploadItem["status"]) => {
      const pendingIdSet = new Set(pendingIds);
      setPendingUploads((current) =>
        current.map((item) =>
          pendingIdSet.has(item.id) ? { ...item, status } : item,
        ),
      );
    },
    [],
  );

  const processUploadQueue = useCallback(async () => {
    if (uploadProcessingRef.current) return;
    uploadProcessingRef.current = true;

    while (uploadQueueRef.current.length > 0) {
      if (uploadPausedRef.current) break;

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
          sizeBytes: file.size,
        }));

        const prepared = await prepareFolderUploads(batch.folderId, metas, {
          accessToken,
          devRole,
        });

        for (let i = 0; i < batch.files.length; i++) {
          const file = batch.files[i];
          const plan = prepared.entries[i];
          if (!plan) throw new Error("Plano de upload incompleto");

          const res = await fetch(plan.signedUrl, {
            method: "PUT",
            headers: {
              "content-type": plan.mimeType,
              "x-upsert": "false",
            },
            body: file,
            signal: controller.signal,
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(txt || `Falha no upload de ${file.name}`);
          }
        }

        await finalizeFolderUploads(
          batch.folderId,
          prepared.entries.map((entry) => ({
            fileId: entry.fileId,
            fileName: entry.fileName,
            mimeType: entry.mimeType,
            sizeBytes: entry.sizeBytes,
            storagePath: entry.storagePath,
          })),
          { accessToken, devRole },
        );

        await loadFolders(batch.folderId);

        if (getActiveFolderId() === batch.folderId) {
          await loadActiveFolder(batch.folderId);
        }

        setInfo(`${batch.files.length} arquivo(s) enviado(s) com sucesso.`);
      } catch (nextError) {
        const err = (nextError ?? {}) as { status?: number; code?: string };
        const canceledByTimeout =
          err.status === 408 && err.code === "REQUEST_TIMEOUT";

        if (canceledByTimeout) {
          updatePendingUploadStatus(batch.pendingIds, "canceled");
          removePendingUploads(batch.pendingIds);
          setInfo("Upload cancelado.");
        } else {
          const nextAttempts = (batch.attempts ?? 0) + 1;
          const delay = Math.min(
            BASE_UPLOAD_RETRY_DELAY_MS *
              Math.pow(2, Math.max(0, nextAttempts - 1)),
            MAX_UPLOAD_RETRY_DELAY_MS,
          );

          if (nextAttempts < MAX_UPLOAD_ATTEMPTS) {
            updatePendingUploadStatus(batch.pendingIds, "queued");

            if (uploadQueueRef.current.length <= 1) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }

            uploadQueueRef.current.push({ ...batch, attempts: nextAttempts });
            setError(
              getErrorMessage(
                nextError,
                "Falha ao enviar arquivos. Repetindo...",
              ),
            );
          } else {
            updatePendingUploadStatus(batch.pendingIds, "failed");
            setError(
              getErrorMessage(
                nextError,
                "Falha ao enviar arquivos apos multiplas tentativas.",
              ),
            );
          }
        }
      } finally {
        uploadAbortControllerRef.current = null;
        currentUploadingBatchRef.current = null;
        uploadQueueRef.current.shift();
        setQueuedUploadsCount(uploadQueueRef.current.length);

        const wasRequeued = uploadQueueRef.current.find(
          (queuedBatch) =>
            queuedBatch.id === batch.id &&
            queuedBatch.attempts > batch.attempts,
        );

        if (!wasRequeued) {
          removePendingUploads(batch.pendingIds);
        }
      }
    }

    uploadProcessingRef.current = false;
  }, [
    accessToken,
    devRole,
    getActiveFolderId,
    loadActiveFolder,
    loadFolders,
    removePendingUploads,
    setError,
    setInfo,
    updatePendingUploadStatus,
  ]);

  const enqueueUploadFiles = useCallback(
    async (filesLike: FileList | File[], folderId: string) => {
      const files = Array.from(filesLike);
      if (files.length === 0) {
        setError("Selecione ao menos um arquivo.");
        return;
      }

      setError(null);
      setInfo(null);
      onNavigateToFolder?.(folderId);

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
          previewUrl: isPreviewableFile(file.type, file.name)
            ? URL.createObjectURL(file)
            : null,
          createdAt,
          status: "queued",
          attempts: 0,
          errorMessage: null,
        }));

        return {
          id: batchId,
          folderId,
          files: batchFiles,
          pendingIds: pendingItems.map((item) => item.id),
          pendingItems,
          attempts: 0,
        };
      });

      setPendingUploads((current) => [
        ...pendingBatches.flatMap((batch) => batch.pendingItems),
        ...current,
      ]);

      uploadQueueRef.current.push(
        ...pendingBatches.map((batch) => ({
          id: batch.id,
          folderId: batch.folderId,
          files: batch.files,
          pendingIds: batch.pendingIds,
          attempts: batch.attempts,
        })),
      );

      setQueuedUploadsCount(uploadQueueRef.current.length);
      setInfo(
        batches.length > 1
          ? `${files.length} arquivo(s) adicionados em ${batches.length} lote(s) para upload.`
          : `${files.length} arquivo(s) adicionados para upload.`,
      );

      void processUploadQueue();
    },
    [onNavigateToFolder, processUploadQueue, setError, setInfo],
  );

  const pauseUploads = useCallback(() => setUploadPaused(true), []);

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
    const pendingIds = toCancel.flatMap((batch) => batch.pendingIds);

    uploadQueueRef.current = queue.slice(
      0,
      uploadProcessingRef.current ? 1 : 0,
    );
    setQueuedUploadsCount(uploadQueueRef.current.length);
    updatePendingUploadStatus(pendingIds, "canceled");
    removePendingUploads(pendingIds);
    setInfo("Lotes em fila cancelados.");
  }, [removePendingUploads, setInfo, updatePendingUploadStatus]);

  const cancelAllUploads = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    const currentBatch = currentUploadingBatchRef.current;
    const queued = uploadQueueRef.current;

    const pendingIds = [
      ...(currentBatch?.pendingIds ?? []),
      ...queued.flatMap((batch) => batch.pendingIds),
    ];

    if (controller) {
      try {
        controller.abort();
      } catch {
        // noop
      }
    }

    uploadQueueRef.current = [];
    setQueuedUploadsCount(0);
    updatePendingUploadStatus(pendingIds, "canceled");
    removePendingUploads(pendingIds);
    setUploadPaused(false);
    setInfo("Upload cancelado para todos os lotes.");
  }, [removePendingUploads, setInfo, updatePendingUploadStatus]);

  return {
    cancelAllUploads,
    cancelQueuedUploads,
    enqueueUploadFiles,
    pauseUploads,
    pendingUploads,
    queuedUploadsCount,
    resumeUploads,
    uploadPaused,
  };
}
