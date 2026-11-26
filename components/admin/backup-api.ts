import { fetchAuthed } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import { parseEnvelope } from "@/lib/api/http-client";

/** O teste chama o Apps Script, que pode levar alguns segundos para acordar. */
const BACKUP_API_TIMEOUT_MS = 45_000;

export type BackupLink = { url: string | null; atualizadoEm: string | null };
export type BackupLinkCheck = { ok: boolean; message: string };
type BackupLinkResponse = { link: BackupLink | null; check: BackupLinkCheck | null };

function parse(response: Response) {
  return parseEnvelope<BackupLinkResponse>(response, { fallbackErrorMessage: "Falha na API do backup." });
}

export async function fetchBackupLink(requestAuth: RequestAuth, testar = false) {
  const response = await fetchAuthed(
    `/api/v1/admin/backup/link${testar ? "?testar=1" : ""}`,
    requestAuth,
    { cache: "no-store" },
    BACKUP_API_TIMEOUT_MS
  );
  return parse(response);
}

export async function saveBackupLink(requestAuth: RequestAuth, url: string, apenasTestar = false) {
  const response = await fetchAuthed(
    "/api/v1/admin/backup/link",
    requestAuth,
    { method: "PUT", body: JSON.stringify({ url, apenasTestar }) },
    BACKUP_API_TIMEOUT_MS
  );
  return parse(response);
}
