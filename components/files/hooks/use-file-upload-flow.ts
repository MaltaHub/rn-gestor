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
import { isPreviewableFile } from "@/lib/files/shared";

const BASE_UPLOAD_RETRY_DELAY_MS = 1_500;
const MAX_UPLOAD_RETRY_DELAY_MS = 30_000;
const MAX_UPLOAD_ATTEMPTS = 5;
// Uploads simultâneos. O PUT ao storage é o trecho longo e paraleliza bem;
// 4 mantém o pipeline cheio sem saturar conexões de celular.
const UPLOAD_CONCURRENCY = 4;

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
  // Um arquivo por lote: cada upload é finalizado (persistido no banco) assim que
  // cai no storage. Assim, sair da página no meio mantém tudo que já subiu, e uma
  // falha isolada não derruba os demais (o retry reprepara um id novo, sem duplicar).
  return files.map((file) => [file]);
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
  const uploadProcessingRef = useRef(false);
  // Pool paralelo: vários lotes em voo, um AbortController por lote.
  const activeControllersRef = useRef<Set<AbortController>>(new Set());
  const inFlightBatchesRef = useRef<Set<PendingUploadBatch>>(new Set());
  // Finalize serializado: dois finalizes simultâneos na mesma pasta calculariam
  // o mesmo sort_order (getNextFolderFileSortOrder lê o max corrente).
  const finalizeChainRef = useRef<Promise<void>>(Promise.resolve());
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

  // Avisa antes de sair se ainda há uploads na fila/enviando, para não perder o
  // que ainda não foi persistido (o que já subiu é finalizado por arquivo).
  useEffect(() => {
    const hasInFlight = pendingUploads.some(
      (item) => item.status === "uploading" || item.status === "queued",
    );
    if (!hasInFlight) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingUploads]);

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

    let completedCount = 0;
    let lastFolderId: string | null = null;

    const uploadBatch = async (batch: PendingUploadBatch) => {
      const controller = new AbortController();
      activeControllersRef.current.add(controller);
      inFlightBatchesRef.current.add(batch);
      updatePendingUploadStatus(batch.pendingIds, "uploading");

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

        // Encadeia o finalize (serializado entre lotes) preservando a ordem de
        // chegada do sort_order e evitando corrida na mesma pasta.
        const finalizePromise = finalizeChainRef.current.then(() =>
          finalizeFolderUploads(
            batch.folderId,
            prepared.entries.map((entry) => ({
              fileId: entry.fileId,
              fileName: entry.fileName,
              mimeType: entry.mimeType,
              sizeBytes: entry.sizeBytes,
              storagePath: entry.storagePath,
            })),
            { accessToken, devRole },
          ).then(() => undefined),
        );
        finalizeChainRef.current = finalizePromise.catch(() => undefined);
        await finalizePromise;

        completedCount += 1;
        lastFolderId = batch.folderId;
        removePendingUploads(batch.pendingIds);
      } catch (nextError) {
        const err = (nextError ?? {}) as { status?: number; code?: string };
        const canceledByTimeout =
          err.status === 408 && err.code === "REQUEST_TIMEOUT";
        const aborted = controller.signal.aborted;

        if (aborted || canceledByTimeout) {
          updatePendingUploadStatus(batch.pendingIds, "canceled");
          removePendingUploads(batch.pendingIds);
          if (canceledByTimeout) setInfo("Upload cancelado.");
        } else {
          const nextAttempts = (batch.attempts ?? 0) + 1;
          const delay = Math.min(
            BASE_UPLOAD_RETRY_DELAY_MS *
              Math.pow(2, Math.max(0, nextAttempts - 1)),
            MAX_UPLOAD_RETRY_DELAY_MS,
          );

          if (nextAttempts < MAX_UPLOAD_ATTEMPTS) {
            updatePendingUploadStatus(batch.pendingIds, "queued");
            setError(
              getErrorMessage(
                nextError,
                "Falha ao enviar arquivos. Repetindo...",
              ),
            );
            // Re-agenda sem bloquear o worker: a fila segue nos demais lotes.
            window.setTimeout(() => {
              uploadQueueRef.current.push({ ...batch, attempts: nextAttempts });
              setQueuedUploadsCount(uploadQueueRef.current.length);
              void processUploadQueue();
            }, delay);
          } else {
            updatePendingUploadStatus(batch.pendingIds, "failed");
            removePendingUploads(batch.pendingIds);
            setError(
              getErrorMessage(
                nextError,
                "Falha ao enviar arquivos apos multiplas tentativas.",
              ),
            );
          }
        }
      } finally {
        activeControllersRef.current.delete(controller);
        inFlightBatchesRef.current.delete(batch);
      }
    };

    const worker = async () => {
      while (!uploadPausedRef.current) {
        const batch = uploadQueueRef.current.shift();
        if (!batch) break;
        setQueuedUploadsCount(uploadQueueRef.current.length);
        setError(null);
        await uploadBatch(batch);
      }
    };

    await Promise.all(
      Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()),
    );

    uploadProcessingRef.current = false;

    // Refresh único quando a fila esvazia (antes era por arquivo — recarregar a
    // árvore de pastas + pasta ativa a cada foto dominava o tempo de upload).
    if (completedCount > 0 && lastFolderId) {
      await loadFolders(lastFolderId);
      if (getActiveFolderId() === lastFolderId) {
        await loadActiveFolder(lastFolderId);
      }
      if (uploadQueueRef.current.length === 0) {
        setInfo("Upload concluido.");
      }
    }
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

    // Lotes em voo não estão mais na fila (shift no take); cancela só os à espera.
    const pendingIds = queue.flatMap((batch) => batch.pendingIds);

    uploadQueueRef.current = [];
    setQueuedUploadsCount(0);
    updatePendingUploadStatus(pendingIds, "canceled");
    removePendingUploads(pendingIds);
    setInfo("Lotes em fila cancelados.");
  }, [removePendingUploads, setInfo, updatePendingUploadStatus]);

  const cancelAllUploads = useCallback(() => {
    const queued = uploadQueueRef.current;
    const inFlight = Array.from(inFlightBatchesRef.current);

    const pendingIds = [
      ...inFlight.flatMap((batch) => batch.pendingIds),
      ...queued.flatMap((batch) => batch.pendingIds),
    ];

    for (const controller of activeControllersRef.current) {
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
