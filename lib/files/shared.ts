export const FILES_BUCKET = process.env.SUPABASE_FILES_BUCKET?.trim() || "gestor-arquivos";
export const FILES_SIGNED_URL_TTL_SECONDS = 60 * 30;
export const MAX_FILE_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_UPLOAD_BATCH_BYTES = 24 * 1024 * 1024;
export const MAX_FILE_UPLOAD_COUNT = 30;

export type FilePreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "none";

export function normalizeFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalDescription(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function normalizeFileName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function toFolderSlug(value: string) {
  const normalized = normalizeFolderName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sanitizeFileName(value: string) {
  const parts = value.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()?.toLowerCase() ?? ""}` : "";
  const baseName = parts.join(".") || value;

  const safeBase = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return `${safeBase || "arquivo"}${extension}`;
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFilePreviewKind(mimeType: string | null | undefined, fileName?: string | null): FilePreviewKind {
  const normalizedMime = String(mimeType ?? "").toLowerCase();
  const normalizedName = String(fileName ?? "").toLowerCase();

  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime === "application/pdf" || normalizedName.endsWith(".pdf")) return "pdf";
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("audio/")) return "audio";
  if (
    normalizedMime.startsWith("text/") ||
    normalizedMime === "application/json" ||
    normalizedMime === "application/xml" ||
    normalizedMime === "text/xml" ||
    normalizedName.endsWith(".md") ||
    normalizedName.endsWith(".txt") ||
    normalizedName.endsWith(".csv") ||
    normalizedName.endsWith(".log")
  ) {
    return "text";
  }

  return "none";
}

export function isPreviewableFile(mimeType: string | null | undefined, fileName?: string | null) {
  return getFilePreviewKind(mimeType, fileName) !== "none";
}
