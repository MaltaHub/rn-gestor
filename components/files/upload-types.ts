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
