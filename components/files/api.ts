import { ApiClientError, buildAuthHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { FileFolderDetail, FileFolderSummary } from "@/components/files/types";

type ApiEnvelope<T> = {
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;
const FILE_UPLOAD_REQUEST_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_API_REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      cache: "no-store",
      ...init,
      signal: externalSignal ?? controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("Tempo limite excedido ao comunicar com a API.", {
        status: 408,
        code: "REQUEST_TIMEOUT"
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseApi<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || json.error) {
    throw new ApiClientError(json.error?.message ?? "Falha na operacao da API", {
      status: response.status,
      code: json.error?.code,
      details: json.error?.details
    });
  }

  return json.data;
}

export async function fetchFileFolders(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/files/folders", {
    headers: {
      ...buildAuthHeaders(requestAuth)
    }
  });

  return parseApi<{ folders: FileFolderSummary[] }>(response);
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
    fileName: string;
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
