import type { ActorContext } from "@/lib/api/auth";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { ApiHttpError } from "@/lib/api/errors";

type AuditAction = "create" | "update" | "delete" | "rebuild" | "finalize";

const actionHints: Record<AuditAction, string[]> = {
  create: ["create", "criar", "insert", "inserir"],
  update: ["update", "editar", "alterar"],
  delete: ["delete", "remover", "excluir"],
  rebuild: ["rebuild", "recalcular", "reprocessar"],
  finalize: ["final", "venda", "sold"]
};

async function resolveAuditActionCode(action: AuditAction) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lookup_audit_actions")
    .select("code, name, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    throw new ApiHttpError(500, "AUDIT_ACTION_LOOKUP_FAILED", "Nao foi possivel resolver lookup de auditoria.");
  }

  const hints = actionHints[action];
  const match = data.find((row) => {
    const code = row.code.toLowerCase();
    const name = row.name.toLowerCase();
    return hints.some((hint) => code.includes(hint) || name.includes(hint));
  });

  return match?.code ?? data[0].code;
}

export async function writeAuditLog(params: {
  action: AuditAction;
  table: string;
  pk?: string | null;
  actor: ActorContext;
  oldData?: Json | null;
  newData?: Json | null;
  details?: string;
  loteId?: string | null;
  emLote?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const acao = await resolveAuditActionCode(params.action);

  const payload = {
    acao,
    tabela: params.table,
    pk: params.pk ?? null,
    autor: params.actor.userName,
    autor_usuario_id: params.actor.userId,
    autor_email: params.actor.userEmail,
    autor_cargo: params.actor.role,
    dados_anteriores: params.oldData ?? null,
    dados_novos: params.newData ?? null,
    detalhes: params.details ?? null,
    lote_id: params.loteId ?? null,
    em_lote: params.emLote ?? false
  };

  const { error } = await supabase.from("log_alteracoes").insert(payload);

  if (error) {
    throw new ApiHttpError(500, "AUDIT_WRITE_FAILED", "Falha ao persistir log de auditoria.", error);
  }
}
