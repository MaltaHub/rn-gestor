import { useEffect, useRef, useState } from "react";

export type PendingUploadStatus =
  | "queued"
  | "uploading"
  | "failed"
  | "canceled"
  | "completed";

export type PendingUploadItem = {
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

export type PendingUploadBatch = {
  id: string;
  folderId: string;
  files: File[];
  pendingIds: string[];
  attempts: number;
  nextRetryAt?: number;
  canceled?: boolean;
};

export function useFileUploadFlow() {
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
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

  return {
    currentUploadingBatchRef,
    pendingUploads,
    pendingUploadsRef,
    queuedUploadsCount,
    setPendingUploads,
    setQueuedUploadsCount,
    setUploadPaused,
    uploadAbortControllerRef,
    uploadPaused,
    uploadPausedRef,
    uploadProcessingRef,
    uploadQueueRef,
  };
}
