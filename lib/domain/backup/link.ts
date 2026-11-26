import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError, databaseRuleMessage } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Link do Apps Script que recebe o backup (internal.app_settings.url_appscript_supply).
 * Só o ADMINISTRADOR lê/troca; a troca só grava depois de o link responder como o
 * backup-monolith.gs (sem token ele recusa com BACKUP_UNAUTHORIZED).
 */

export type BackupLink = { url: string | null; atualizadoEm: string | null };

export type BackupLinkCheck =
  | { ok: true; message: string }
  | { ok: false; message: string };

const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const PING_TIMEOUT_MS = 20_000;

/** Aceita o link com espaços nas pontas e sem parâmetros; devolve null se não for /exec. */
export function normalizeBackupLink(value: string): string | null {
  const url = value.trim().replace(/[?#].*$/, "");
  return EXEC_URL.test(url) ? url : null;
}

/** Interpreta a resposta do ping (POST sem token). Puro, para testar sem rede. */
export function interpretBackupPing(status: number, body: string): BackupLinkCheck {
  let json: { ok?: unknown; error?: unknown } | null = null;
  try {
    json = JSON.parse(body) as { ok?: unknown; error?: unknown };
  } catch {
    json = null;
  }

  if (json && json.error === "BACKUP_UNAUTHORIZED") {
    return { ok: true, message: "O Apps Script do backup respondeu." };
  }
  if (json && json.error === "BACKUP_TOKEN_NOT_CONFIGURED") {
    return { ok: false, message: "O Apps Script respondeu, mas falta a propriedade WEBHOOK_TOKEN no projeto." };
  }
  if (json && typeof json.error === "string") {
    return { ok: false, message: `O Apps Script respondeu com erro inesperado (${json.error.slice(0, 60)}).` };
  }
  if (/accounts\.google\.com|ServiceLogin/i.test(body)) {
    return { ok: false, message: "A implantação pede login do Google. Em “Quem pode acessar”, escolha “Qualquer pessoa”." };
  }
  if (status === 404) {
    return { ok: false, message: "Esse link não existe mais (a implantação foi arquivada ou apagada)." };
  }
  return { ok: false, message: "Esse link não respondeu como o Apps Script do backup." };
}

export async function checkBackupLink(url: string, fetcher: typeof fetch = fetch): Promise<BackupLinkCheck> {
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops: [] }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS)
    });
    return interpretBackupPing(response.status, (await response.text()).slice(0, 4000));
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      message: timedOut ? "O Apps Script não respondeu em 20 segundos." : "Não foi possível falar com o Apps Script."
    };
  }
}

export async function getBackupLink(supabase: SupabaseClient<Database>, requestId: string): Promise<BackupLink> {
  const { data, error } = await supabase.rpc("fn_backup_link");
  if (error) {
    console.error("[BACKUP_LINK_READ_FAILED]", { requestId, error });
    throw new ApiHttpError(500, "BACKUP_LINK_READ_FAILED", "Falha ao ler o link do backup.");
  }
  const row = data?.[0];
  return { url: row?.url ?? null, atualizadoEm: row?.atualizado_em ?? null };
}

export async function setBackupLink(
  supabase: SupabaseClient<Database>,
  requestId: string,
  url: string
): Promise<BackupLink> {
  const { data, error } = await supabase.rpc("fn_backup_link_definir", { p_url: url });
  if (error) {
    const rule = databaseRuleMessage(error);
    if (rule) throw new ApiHttpError(400, "BACKUP_LINK_INVALID", rule);
    console.error("[BACKUP_LINK_SAVE_FAILED]", { requestId, error });
    throw new ApiHttpError(500, "BACKUP_LINK_SAVE_FAILED", "Falha ao salvar o link do backup.");
  }
  const row = data?.[0];
  return { url: row?.url ?? null, atualizadoEm: row?.atualizado_em ?? null };
}
