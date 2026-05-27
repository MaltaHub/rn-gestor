import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActorContext } from "@/lib/api/auth";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

export const OBSERVACAO_TIPOS = ["urgente", "observacao"] as const;
export type ObservacaoTipo = (typeof OBSERVACAO_TIPOS)[number];

const SELECT_COLUMNS =
  "id,carro_id,tipo,texto,status,autor_auth_user_id,resolvido_em,created_at,updated_at";

export const criarObservacaoSchema = z.object({
  carro_id: z.string().uuid("carro_id invalido."),
  tipo: z.enum(OBSERVACAO_TIPOS),
  texto: z.string().trim().min(1, "Escreva a observacao.").max(2000)
});

export type CriarObservacaoInput = z.infer<typeof criarObservacaoSchema>;

/** Post-its ainda ativos de um carro (para a lista do atalho). */
export async function listAtivasByCarro(supabase: Supabase, carroId: string) {
  const { data, error } = await supabase
    .from("observacoes")
    .select(SELECT_COLUMNS)
    .eq("carro_id", carroId)
    .eq("status", "ativo")
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiHttpError(500, "OBSERVACAO_LIST_FAILED", "Falha ao listar post-its.", error);
  }

  return data ?? [];
}

export async function criarObservacao(supabase: Supabase, actor: ActorContext, input: CriarObservacaoInput) {
  const { data, error } = await supabase
    .from("observacoes")
    .insert({
      carro_id: input.carro_id,
      tipo: input.tipo,
      texto: input.texto.trim(),
      status: "ativo",
      autor_auth_user_id: actor.authUserId
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new ApiHttpError(400, "OBSERVACAO_CREATE_FAILED", "Falha ao criar o post-it.", error);
  }

  await writeAuditLog({ action: "create", table: "observacoes", pk: data.id, actor, newData: toAuditJson(data) });
  return data;
}

/** Marca um post-it como resolvido. Restricao de cargo e feita no endpoint. */
export async function resolverObservacao(supabase: Supabase, actor: ActorContext, id: string) {
  const { data: atual, error: readError } = await supabase
    .from("observacoes")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    throw new ApiHttpError(400, "OBSERVACAO_READ_FAILED", "Falha ao carregar o post-it.", readError);
  }
  if (!atual) {
    throw new ApiHttpError(404, "NOT_FOUND", "Post-it nao encontrado.", { id });
  }
  if (atual.status === "resolvido") {
    throw new ApiHttpError(409, "OBSERVACAO_JA_RESOLVIDA", "Este post-it ja foi resolvido.", { id });
  }

  const { data, error } = await supabase
    .from("observacoes")
    .update({ status: "resolvido" })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new ApiHttpError(400, "OBSERVACAO_RESOLVE_FAILED", "Falha ao resolver o post-it.", error);
  }

  await writeAuditLog({
    action: "update",
    table: "observacoes",
    pk: id,
    actor,
    oldData: toAuditJson(atual),
    newData: toAuditJson(data)
  });
  return data;
}

/** Conta post-its urgentes ainda ativos (aciona o alerta vermelho no atalho). */
export async function contarUrgentesAtivas(supabase: Supabase) {
  const { count, error } = await supabase
    .from("observacoes")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "urgente")
    .eq("status", "ativo");

  if (error) {
    throw new ApiHttpError(500, "OBSERVACAO_COUNT_FAILED", "Falha ao contar urgentes.", error);
  }

  return count ?? 0;
}
