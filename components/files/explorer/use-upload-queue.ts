import { useCallback, useEffect, useRef, useState } from "react";

import { finalizeUploads, prepareUploads, type PreparedUpload } from "@/components/files/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ExplorerFile } from "@/lib/files/explorer-types";
import { MAX_FILE_UPLOAD_SIZE_BYTES } from "@/lib/files/shared";

/**
 * Fila única de upload (todo caminho de envio passa por aqui):
 * prepare em lote (1 requisição por leva) → PUT direto ao Storage em paralelo
 * (XHR, com progresso real) → finalize agrupado e serializado (sort_order sem
 * corrida). Cada arquivo é persistido assim que sobe: sair no meio mantém o
 * que já foi.
 */

export type UploadStatus = "queued" | "uploading" | "finalizing" | "done" | "failed";

export type UploadItem = {
  id: string;
  folderId: string;
  file: File;
  name: string;
  sizeBytes: number;
  mimeType: string;
  status: UploadStatus;
  progress: number;
  attempts: number;
  error: string | null;
};

const PUT_CONCURRENCY = 4;
const PREPARE_BATCH = 40;
const MAX_ATTEMPTS = 3;

function localId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function putWithProgress(url: string, file: File, mimeType: string, onProgress: (ratio: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", mimeType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || `Falha no envio de ${file.name} (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar ${file.name}.`));
    xhr.onabort = () => reject(new DOMException("Envio cancelado.", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

type Plan = PreparedUpload;

export function useUploadQueue(params: {
  auth: RequestAuth;
  onUploaded: (folderId: string, files: ExplorerFile[]) => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const plansRef = useRef(new Map<string, Plan>());
  const runningRef = useRef(0);
  const preparingRef = useRef(false);
  const controllersRef = useRef(new Map<string, AbortController>());
  const finalizeBufferRef = useRef<Array<{ itemId: string; folderId: string; plan: Plan }>>([]);
  const finalizingRef = useRef(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const patch = useCallback((ids: string[], change: Partial<UploadItem> | ((item: UploadItem) => Partial<UploadItem>)) => {
    const set = new Set(ids);
    itemsRef.current = itemsRef.current.map((item) =>
      set.has(item.id) ? { ...item, ...(typeof change === "function" ? change(item) : change) } : item
    );
    setItems(itemsRef.current);
  }, []);

  const flushFinalize = useCallback(async () => {
    if (finalizingRef.current || finalizeBufferRef.current.length === 0) return;
    finalizingRef.current = true;
    try {
      while (finalizeBufferRef.current.length > 0) {
        const folderId = finalizeBufferRef.current[0].folderId;
        const batch = finalizeBufferRef.current.filter((entry) => entry.folderId === folderId).slice(0, 50);
        const batchIds = new Set(batch.map((entry) => entry.itemId));
        finalizeBufferRef.current = finalizeBufferRef.current.filter((entry) => !batchIds.has(entry.itemId));
        try {
          const result = await finalizeUploads(
            paramsRef.current.auth,
            folderId,
            batch.map(({ plan }) => ({
              fileId: plan.fileId,
              fileName: plan.fileName,
              mimeType: plan.mimeType,
              sizeBytes: plan.sizeBytes,
              storagePath: plan.storagePath
            }))
          );
          patch(Array.from(batchIds), { status: "done", progress: 1 });
          paramsRef.current.onUploaded(folderId, result.files);
        } catch (error) {
          patch(Array.from(batchIds), {
            status: "failed",
            error: error instanceof Error ? error.message : "Falha ao registrar o arquivo."
          });
          batch.forEach(({ itemId }) => plansRef.current.delete(itemId));
          paramsRef.current.onError(error instanceof Error ? error.message : "Falha ao registrar arquivos enviados.");
        }
      }
    } finally {
      finalizingRef.current = false;
    }
  }, [patch]);

  const pump = useCallback(async () => {
    // 1) Prepara a próxima leva (mesma pasta) numa requisição só.
    if (!preparingRef.current) {
      const unplanned = itemsRef.current.filter((item) => item.status === "queued" && !plansRef.current.has(item.id));
      if (unplanned.length > 0) {
        preparingRef.current = true;
        const folderId = unplanned[0].folderId;
        const batch = unplanned.filter((item) => item.folderId === folderId).slice(0, PREPARE_BATCH);
        try {
          const prepared = await prepareUploads(
            paramsRef.current.auth,
            folderId,
            batch.map((item) => ({ fileName: item.name, mimeType: item.mimeType, sizeBytes: item.sizeBytes }))
          );
          batch.forEach((item, position) => {
            const plan = prepared.entries[position];
            if (plan) plansRef.current.set(item.id, plan);
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao preparar o envio.";
          patch(
            batch.map((item) => item.id),
            { status: "failed", error: message }
          );
          paramsRef.current.onError(message);
        } finally {
          preparingRef.current = false;
        }
        void pump();
      }
    }

    // 2) Sobe os já preparados, até PUT_CONCURRENCY em paralelo.
    while (runningRef.current < PUT_CONCURRENCY) {
      const next = itemsRef.current.find((item) => item.status === "queued" && plansRef.current.has(item.id));
      if (!next) break;
      const plan = plansRef.current.get(next.id);
      if (!plan) break;
      runningRef.current += 1;
      const controller = new AbortController();
      controllersRef.current.set(next.id, controller);
      patch([next.id], (item) => ({ status: "uploading", progress: 0, attempts: item.attempts + 1, error: null }));

      void putWithProgress(
        plan.signedUrl,
        next.file,
        plan.mimeType,
        (ratio) => {
          // Re-render só a cada ~5%: progresso fino de 4 envios travaria a lista.
          const shown = itemsRef.current.find((item) => item.id === next.id)?.progress ?? 0;
          if (ratio - shown >= 0.05) patch([next.id], { progress: Math.min(ratio, 0.99) });
        },
        controller.signal
      )
        .then(() => {
          patch([next.id], { status: "finalizing", progress: 0.99 });
          finalizeBufferRef.current.push({ itemId: next.id, folderId: next.folderId, plan });
          void flushFinalize();
        })
        .catch((error: unknown) => {
          const aborted = error instanceof DOMException && error.name === "AbortError";
          const current = itemsRef.current.find((item) => item.id === next.id);
          // URL de upload é de uso único: nova tentativa reprepara (id novo, sem duplicar).
          plansRef.current.delete(next.id);
          if (!aborted && current && current.attempts < MAX_ATTEMPTS) {
            patch([next.id], { status: "queued", progress: 0 });
          } else {
            patch([next.id], {
              status: "failed",
              error: aborted ? "Cancelado." : error instanceof Error ? error.message : "Falha no envio."
            });
          }
        })
        .finally(() => {
          runningRef.current -= 1;
          controllersRef.current.delete(next.id);
          void pump();
        });
    }
  }, [flushFinalize, patch]);

  const enqueue = useCallback(
    (filesLike: FileList | File[], folderId: string) => {
      const files = Array.from(filesLike);
      const tooLarge = files.filter((file) => file.size > MAX_FILE_UPLOAD_SIZE_BYTES);
      const valid = files.filter((file) => file.size > 0 && file.size <= MAX_FILE_UPLOAD_SIZE_BYTES);
      if (tooLarge.length > 0) {
        paramsRef.current.onError(
          `${tooLarge.map((file) => file.name).join(", ")} excede(m) o limite de ${Math.round(MAX_FILE_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`
        );
      }
      if (valid.length === 0) return;

      const next: UploadItem[] = valid.map((file) => ({
        id: localId(),
        folderId,
        file,
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        status: "queued",
        progress: 0,
        attempts: 0,
        error: null
      }));
      itemsRef.current = [...itemsRef.current, ...next];
      setItems(itemsRef.current);
      void pump();
    },
    [pump]
  );

  const retryFailed = useCallback(() => {
    const failed = itemsRef.current.filter((item) => item.status === "failed").map((item) => item.id);
    if (failed.length === 0) return;
    patch(failed, { status: "queued", progress: 0, attempts: 0, error: null });
    void pump();
  }, [patch, pump]);

  const cancelAll = useCallback(() => {
    const queued = itemsRef.current.filter((item) => item.status === "queued").map((item) => item.id);
    patch(queued, { status: "failed", error: "Cancelado." });
    controllersRef.current.forEach((controller) => controller.abort());
  }, [patch]);

  const clearFinished = useCallback(() => {
    itemsRef.current = itemsRef.current.filter((item) => item.status !== "done" && item.status !== "failed");
    setItems(itemsRef.current);
  }, []);

  const active = items.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "finalizing");

  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  // Some da lista quem terminou há alguns segundos (o arquivo já está no índice).
  useEffect(() => {
    if (active || !items.some((item) => item.status === "done")) return;
    const timer = window.setTimeout(() => {
      itemsRef.current = itemsRef.current.filter((item) => item.status !== "done");
      setItems(itemsRef.current);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [active, items]);

  return { items, active, enqueue, retryFailed, cancelAll, clearFinished };
}

export function summarizeUploads(items: UploadItem[]) {
  const inFlight = items.filter((item) => item.status !== "done" && item.status !== "failed");
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  const sentBytes = items.reduce((sum, item) => sum + item.sizeBytes * (item.status === "done" ? 1 : item.progress), 0);
  return {
    total: items.length,
    done: items.filter((item) => item.status === "done").length,
    failed: items.filter((item) => item.status === "failed").length,
    inFlight: inFlight.length,
    ratio: totalBytes > 0 ? sentBytes / totalBytes : 0
  };
}
