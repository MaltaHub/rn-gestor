import { buildAuthHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type {
  ExplorerFile,
  ExplorerFolder,
  ExplorerIndex,
  FileAutomationRepositoryKey,
  FileAutomationRules,
  FileAutomationSettings,
  SignedUrlVariant,
  SignUrlsResponse,
  VehicleFolderDisplayField
} from "@/lib/files/explorer-types";
import { apiFetch, parseEnvelope } from "@/lib/api/http-client";
import type { Inconsistency } from "@/lib/domain/file-automations/inconsistencies";
import type { OcrCatalogTable } from "@/lib/domain/ocr/catalog";
import type { OcrTemplateInput } from "@/lib/domain/ocr/schemas";
import type { OcrTemplate, OcrTemplateSummary } from "@/lib/domain/ocr/types";

const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 180_000;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

async function request<T>(path: string, auth: RequestAuth, options: RequestOptions = {}) {
  const hasBody = options.body !== undefined;
  const response = await apiFetch(
    path,
    {
      method: options.method ?? "GET",
      cache: "no-store",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...buildAuthHeaders(auth)
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal
    },
    { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }
  );
  return parseEnvelope<T>(response, { fallbackErrorMessage: "Falha na operacao de arquivos." });
}

// ----------------------------------------------------------------- leitura

export function fetchExplorerIndex(auth: RequestAuth, signal?: AbortSignal) {
  return request<ExplorerIndex>("/api/v1/files/index", auth, { signal });
}

export function signFileUrls(auth: RequestAuth, fileIds: string[], variant: SignedUrlVariant) {
  return request<SignUrlsResponse>("/api/v1/files/sign", auth, { method: "POST", body: { fileIds, variant } });
}

// ------------------------------------------------------------------ pastas

export function createFolder(
  auth: RequestAuth,
  payload: { name: string; description?: string | null; parentFolderId?: string | null }
) {
  return request<{ folder: ExplorerFolder }>("/api/v1/files/folders", auth, { method: "POST", body: payload });
}

export function updateFolder(
  auth: RequestAuth,
  folderId: string,
  payload: { name?: string; description?: string | null; parentFolderId?: string | null }
) {
  return request<{ folder: ExplorerFolder }>(`/api/v1/files/folders/${folderId}`, auth, {
    method: "PATCH",
    body: payload
  });
}

export function deleteFolder(auth: RequestAuth, folderId: string) {
  return request<{ deleted: boolean; id: string; folderIds: string[]; fileIds: string[] }>(
    `/api/v1/files/folders/${folderId}`,
    auth,
    { method: "DELETE" }
  );
}

export function setFolderAutomationPaused(auth: RequestAuth, folderId: string, paused: boolean) {
  return request<{ folderId: string; paused: boolean; carroId: string | null }>(
    `/api/v1/files/folders/${folderId}/automation`,
    auth,
    { method: "PATCH", body: { paused } }
  );
}

// ---------------------------------------------------------------- arquivos

export function renameFile(auth: RequestAuth, fileId: string, fileName: string) {
  return request<{ file: ExplorerFile }>(`/api/v1/files/files/${fileId}`, auth, {
    method: "PATCH",
    body: { fileName }
  });
}

export function deleteFiles(auth: RequestAuth, fileIds: string[]) {
  return request<{ deletedIds: string[] }>("/api/v1/files/files/bulk", auth, {
    method: "POST",
    body: { action: "delete", fileIds },
    timeoutMs: LONG_TIMEOUT_MS
  });
}

export function moveFiles(auth: RequestAuth, fileIds: string[], folderId: string) {
  return request<{ files: ExplorerFile[] }>("/api/v1/files/files/bulk", auth, {
    method: "POST",
    body: { action: "move", fileIds, folderId },
    timeoutMs: LONG_TIMEOUT_MS
  });
}

export function reorderFolderFiles(auth: RequestAuth, folderId: string, fileIds: string[]) {
  return request<{ folderId: string; fileIds: string[] }>(`/api/v1/files/folders/${folderId}/files/reorder`, auth, {
    method: "PATCH",
    body: { fileIds }
  });
}

// ----------------------------------------------------------------- upload

export type PreparedUpload = {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  signedUrl: string;
};

export function prepareUploads(
  auth: RequestAuth,
  folderId: string,
  files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>
) {
  return request<{ entries: PreparedUpload[] }>("/api/v1/files/uploads/prepare", auth, {
    method: "POST",
    body: { folderId, files },
    timeoutMs: LONG_TIMEOUT_MS
  });
}

export function finalizeUploads(
  auth: RequestAuth,
  folderId: string,
  entries: Array<Pick<PreparedUpload, "fileId" | "fileName" | "mimeType" | "sizeBytes" | "storagePath">>
) {
  return request<{ folderId: string; files: ExplorerFile[] }>("/api/v1/files/uploads/finalize", auth, {
    method: "POST",
    body: { folderId, entries },
    timeoutMs: LONG_TIMEOUT_MS
  });
}

// --------------------------------------------------------------- automação

export function fetchAutomationSettings(auth: RequestAuth) {
  return request<FileAutomationSettings>("/api/v1/files/automation-config", auth);
}

export function updateAutomationSettings(
  auth: RequestAuth,
  payload: {
    displayField: VehicleFolderDisplayField;
    repositories: Record<FileAutomationRepositoryKey, string>;
    rules?: FileAutomationRules;
  }
) {
  return request<FileAutomationSettings>("/api/v1/files/automation-config", auth, { method: "PATCH", body: payload });
}

export function reconcileAutomations(auth: RequestAuth, carroId?: string) {
  return request<{ processed: number }>("/api/v1/files/automations/reconcile", auth, {
    method: "POST",
    body: carroId ? { carroId } : {},
    timeoutMs: LONG_TIMEOUT_MS
  });
}

export function fetchInconsistencies(auth: RequestAuth) {
  return request<{ issues: Inconsistency[] }>("/api/v1/files/inconsistencies", auth, { timeoutMs: LONG_TIMEOUT_MS });
}

// ----------------------------------------------------------------- veículo

/** Grava chassi/renavam extraídos do CRLV no veículo. */
export function updateVeiculoIdentificacao(
  auth: RequestAuth,
  payload: { carroId: string; chassi?: string | null; renavam?: string | null }
) {
  return request<{ id: string; placa: string | null; chassi: string | null; renavam: string | null }>(
    `/api/v1/carros/${payload.carroId}/identificacao`,
    auth,
    { method: "PATCH", body: { chassi: payload.chassi ?? null, renavam: payload.renavam ?? null } }
  );
}

// --------------------------------------------------------------------- OCR

export function listOcrTemplates(auth: RequestAuth) {
  return request<{ templates: OcrTemplateSummary[] }>("/api/v1/files/ocr/templates", auth);
}

export function listOcrDestinations(auth: RequestAuth) {
  return request<{ tables: OcrCatalogTable[] }>("/api/v1/files/ocr/destinations", auth);
}

export function getOcrTemplate(auth: RequestAuth, id: string) {
  return request<{ template: OcrTemplate }>(`/api/v1/files/ocr/templates/${id}`, auth);
}

export function saveOcrTemplate(auth: RequestAuth, id: string | null, payload: OcrTemplateInput) {
  return request<{ template: OcrTemplate }>(id ? `/api/v1/files/ocr/templates/${id}` : "/api/v1/files/ocr/templates", auth, {
    method: id ? "PATCH" : "POST",
    body: payload,
    timeoutMs: LONG_TIMEOUT_MS
  });
}

export function deleteOcrTemplate(auth: RequestAuth, id: string) {
  return request<{ id: string }>(`/api/v1/files/ocr/templates/${id}`, auth, { method: "DELETE" });
}

export function applyOcrValues(
  auth: RequestAuth,
  payload: { carroId: string; fileId: string | null; templateId: string | null; values: Record<string, string>; markReady: boolean }
) {
  return request<{ carroId: string; applied: Record<string, string | number>; markedReady: boolean }>("/api/v1/files/ocr/apply", auth, {
    method: "POST",
    body: payload
  });
}
