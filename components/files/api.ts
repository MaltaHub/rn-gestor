import { buildAuthHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type {
  FileAutomationRepositoryKey,
  FileAutomationSettings,
  FileFolderDetail,
  FileFolderSummary,
  VehicleFolderDisplayField
} from "@/components/files/types";
import { apiFetch, parseEnvelope } from "@/lib/api/http-client";

const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;
const FILE_UPLOAD_REQUEST_TIMEOUT_MS = 180_000;

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_API_REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal
) {
  return apiFetch(
    input,
    {
      cache: "no-store",
      ...init,
      signal: externalSignal ?? init?.signal
    },
    { timeoutMs }
  );
}

function parseApi<T>(response: Response): Promise<T> {
  return parseEnvelope<T>(response, { fallbackErrorMessage: "Falha na operacao da API" });
}

export async function fetchFileFolders(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/files/folders", {
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  });

  return parseApi<{ folders: FileFolderSummary[] }>(response);
}

export async function fetchFileAutomationSettings(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/files/automation-config", {
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  });

  return parseApi<FileAutomationSettings>(response);
}

export async function updateFileAutomationSettings(
  payload: {
    displayField: VehicleFolderDisplayField;
    repositories: Record<FileAutomationRepositoryKey, string>;
  },
  requestAuth: RequestAuth
) {
  const response = await fetchWithTimeout("/api/v1/files/automation-config", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify(payload)
  });

  return parseApi<FileAutomationSettings>(response);
}

export async function reconcileFileAutomations(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/files/automations/reconcile", {
    method: "POST",
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  }, FILE_UPLOAD_REQUEST_TIMEOUT_MS);

  return parseApi<{ processed: number }>(response);
}

export async function fetchFileFolderDetail(folderId: string, requestAuth: RequestAuth) {
  const response = await fetchWithTimeout(`/api/v1/files/folders/${folderId}`, {
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  });

  return parseApi<FileFolderDetail>(response);
}

export async function createFileFolder(
  payload: {
    name: string;
    description?: string | null;
    parentFolderId?: string | null;
  },
  requestAuth: RequestAuth
) {
  const response = await fetchWithTimeout("/api/v1/files/folders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify(payload)
  });

  return parseApi<{ folder: FileFolderSummary }>(response);
}

export async function updateFileFolder(
  folderId: string,
  payload: {
    name?: string;
    description?: string | null;
    parentFolderId?: string | null;
  },
  requestAuth: RequestAuth
) {
  const response = await fetchWithTimeout(`/api/v1/files/folders/${folderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify(payload)
  });

  return parseApi<FileFolderDetail>(response);
}

export async function deleteFileFolder(folderId: string, requestAuth: RequestAuth) {
  const response = await fetchWithTimeout(`/api/v1/files/folders/${folderId}`, {
    method: "DELETE",
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  });

  return parseApi<{ deleted: boolean; id: string }>(response);
}

export async function uploadFolderFiles(
  folderId: string,
  files: File[],
  requestAuth: RequestAuth,
  signal?: AbortSignal
) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetchWithTimeout(`/api/v1/files/folders/${folderId}/files`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(requestAuth)
    },
    body: formData
  }, FILE_UPLOAD_REQUEST_TIMEOUT_MS, signal);

  return parseApi<FileFolderDetail>(response);
}

export type PrepareUploadEntry = {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  signedUrl: string;
};

export async function prepareFolderUploads(
  folderId: string,
  files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>,
  requestAuth: RequestAuth
) {
  const response = await fetchWithTimeout(`/api/v1/files/uploads/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify({ folderId, files })
  }, FILE_UPLOAD_REQUEST_TIMEOUT_MS);

  return parseApi<{ entries: PrepareUploadEntry[] }>(response);
}

export async function finalizeFolderUploads(
  folderId: string,
  entries: Array<Pick<PrepareUploadEntry, "fileId" | "fileName" | "mimeType" | "sizeBytes" | "storagePath">>,
  requestAuth: RequestAuth
) {
  const response = await fetchWithTimeout(`/api/v1/files/uploads/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify({ folderId, entries })
  }, FILE_UPLOAD_REQUEST_TIMEOUT_MS);

  return parseApi<FileFolderDetail>(response);
}

export async function reorderFolderFiles(folderId: string, fileIds: string[], requestAuth: RequestAuth) {
  const response = await fetchWithTimeout(`/api/v1/files/folders/${folderId}/files/reorder`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify({ fileIds })
  });

  return parseApi<FileFolderDetail>(response);
}

export async function deleteFolderFile(fileId: string, requestAuth: RequestAuth) {
  const response = await fetchWithTimeout(`/api/v1/files/files/${fileId}`, {
    method: "DELETE",
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  });

  return parseApi<{ deleted: boolean; id: string; folderId: string }>(response);
}

export async function renameFolderFile(
  fileId: string,
  payload: {
    fileName?: string;
    folderId?: string | null;
  },
  requestAuth: RequestAuth
) {
  const response = await fetchWithTimeout(`/api/v1/files/files/${fileId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(requestAuth)
    },
    body: JSON.stringify(payload)
  });

  return parseApi<FileFolderDetail>(response);
}
