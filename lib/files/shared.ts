export const FILES_BUCKET = process.env.SUPABASE_FILES_BUCKET?.trim() || "gestor-arquivos";
export const FILES_SIGNED_URL_TTL_SECONDS = 60 * 30;
export const MAX_FILE_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

export function normalizeFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalDescription(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
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

export function isPreviewableFile(mimeType: string | null | undefined) {
  return String(mimeType ?? "").toLowerCase().startsWith("image/");
}
