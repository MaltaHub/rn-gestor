import type { ActorContext } from "@/lib/api/auth";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { ApiHttpError } from "@/lib/api/errors";

type AuditAction = "create" | "update" | "delete" | "rebuild" | "finalize";

type AuditPayload = {
  action: AuditAction;
  table: string;
  pk?: string | null;
  actor: ActorContext;
  oldData?: unknown;
  newData?: unknown;
  details?: string;
  loteId?: string | null;
  emLote?: boolean;
  strict?: boolean;
};

const actionHints: Record<AuditAction, string[]> = {
  create: ["create", "criar", "insert", "inserir"],
  update: ["update", "editar", "alterar"],
  delete: ["delete", "remover", "excluir"],
  rebuild: ["rebuild", "recalcular", "reprocessar"],
  finalize: ["final", "venda", "sold"]
};

const AUDIT_ACTION_CACHE_TTL_MS = 5 * 60 * 1000;

let auditActionCache:
  | {
      expiresAt: number;
      byAction: Record<AuditAction, string>;
    }
  | null = null;

let auditActionCachePromise: Promise<Record<AuditAction, string>> | null = null;

function isAuditActionCacheValid(now: number) {
  return Boolean(auditActionCache && auditActionCache.expiresAt > now);
}

function pickActionCode(action: AuditAction, rows: Array<{ code: string; name: string }>) {
  const hints = actionHints[action];
  const match = rows.find((row) => {
    const code = row.code.toLowerCase();
    const name = row.name.toLowerCase();
    return hints.some((hint) => code.includes(hint) || name.includes(hint));
  });

  return match?.code ?? rows[0]?.code ?? null;
}

async function loadAuditActionCodes() {
  const now = Date.now();
  if (isAuditActionCacheValid(now) && auditActionCache) {
    return auditActionCache.byAction;
  }

  if (auditActionCachePromise) {
    return auditActionCachePromise;
  }

  auditActionCachePromise = (async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lookup_audit_actions")
      .select("code, name, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      throw new ApiHttpError(500, "AUDIT_ACTION_LOOKUP_FAILED", "Nao foi possivel resolver lookup de auditoria.");
    }

    const activeRows = data.map((row) => ({ code: row.code, name: row.name }));
    const byAction = {
      create: pickActionCode("create", activeRows),
      update: pickActionCode("update", activeRows),
      delete: pickActionCode("delete", activeRows),
      rebuild: pickActionCode("rebuild", activeRows),
      finalize: pickActionCode("finalize", activeRows)
    };

    if (Object.values(byAction).some((code) => !code)) {
      throw new ApiHttpError(500, "AUDIT_ACTION_LOOKUP_FAILED", "Lookup de auditoria retornou configuracao incompleta.");
    }

    auditActionCache = {
      expiresAt: Date.now() + AUDIT_ACTION_CACHE_TTL_MS,
      byAction: byAction as Record<AuditAction, string>
    };

    return auditActionCache.byAction;
  })();

  try {
    return await auditActionCachePromise;
  } finally {
    auditActionCachePromise = null;
  }
}

function normalizeAuditJson(value: unknown): Json | null {
  if (value === undefined) return null;
  if (value === null) return null;

  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return {
      __audit_serialization_error: true,
      value_type: typeof value
    } satisfies Record<string, Json>;
  }
}

function reportAuditFailure(error: unknown, params: AuditPayload) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error("[audit] falha ao persistir log", {
    action: params.action,
    table: params.table,
    pk: params.pk ?? null,
    actorUserId: params.actor.userId,
    message
  });
}

export async function writeAuditLog(params: AuditPayload) {
  try {
    const supabase = getSupabaseAdmin();
    const actionCodes = await loadAuditActionCodes();
    const acao = actionCodes[params.action];

    const payload = {
      acao,
      tabela: params.table,
      pk: params.pk ?? null,
      autor: params.actor.userName,
      autor_usuario_id: params.actor.userId,
      autor_email: params.actor.userEmail,
      autor_cargo: params.actor.role,
      dados_anteriores: normalizeAuditJson(params.oldData),
      dados_novos: normalizeAuditJson(params.newData),
      detalhes: params.details ?? null,
      lote_id: params.loteId ?? null,
      em_lote: params.emLote ?? false
    };

    const { error } = await supabase.from("log_alteracoes").insert(payload);

    if (error) {
      throw new ApiHttpError(500, "AUDIT_WRITE_FAILED", "Falha ao persistir log de auditoria.", error);
    }
  } catch (error) {
    if (params.strict) {
      throw error;
    }

    reportAuditFailure(error, params);
  }
}

export function toAuditJson(value: unknown) {
  return normalizeAuditJson(value);
}
