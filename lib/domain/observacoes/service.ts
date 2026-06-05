import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole, type ActorContext } from "@/lib/api/auth";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

export const OBSERVACAO_TIPOS = ["fixo", "urgente", "observacao"] as const;
export type ObservacaoTipo = (typeof OBSERVACAO_TIPOS)[number];

const SELECT_COLUMNS =
  "id,carro_id,titulo,tipo,texto,status,prazo,autor_auth_user_id,resolvido_em,feedback_solucao,created_at,updated_at";

const prazoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Prazo invalido.");

export const criarObservacaoSchema = z.object({
  // Opcional: post-it pode existir sem veiculo vinculado (carro_id = null).
  carro_id: z.string().uuid("carro_id invalido.").nullish(),
  // Titulo opcional (rotulo quando nao ha veiculo).
  titulo: z.string().trim().max(120).nullish(),
  tipo: z.enum(OBSERVACAO_TIPOS),
  texto: z.string().trim().min(1, "Escreva a observacao.").max(2000),
  // Prazo opcional no formato YYYY-MM-DD (date).
  prazo: prazoSchema.nullish()
});

export type CriarObservacaoInput = z.infer<typeof criarObservacaoSchema>;

export const atualizarObservacaoSchema = z
  .object({
    titulo: z.string().trim().max(120).nullish(),
    tipo: z.enum(OBSERVACAO_TIPOS).optional(),
    texto: z.string().trim().min(1, "Texto nao pode ficar vazio.").max(2000).optional(),
    prazo: prazoSchema.nullish(),
    feedback_solucao: z.string().trim().max(2000).nullish()
  })
  .refine(
    (payload) => Object.keys(payload).length > 0,
    "Nada para atualizar."
  );

export type AtualizarObservacaoInput = z.infer<typeof atualizarObservacaoSchema>;

export const resolverObservacaoSchema = z
  .object({
    feedback_solucao: z.string().trim().max(2000).nullish()
  })
  .partial();

export type ResolverObservacaoInput = z.infer<typeof resolverObservacaoSchema>;

type SortablePostit = { tipo: string; prazo: string | null; created_at: string };

/**
 * Ordena post-its para exibicao (funcao pura, testavel):
 *  1. tipo "fixo" sempre primeiro;
 *  2. depois por prazo mais proximo (asc; sem prazo por ultimo);
 *  3. depois mais recentes.
 * Strings YYYY-MM-DD / ISO sao comparaveis lexicograficamente = cronologicamente.
 */
export function comparePostits(a: SortablePostit, b: SortablePostit): number {
  const aFixo = a.tipo === "fixo";
  const bFixo = b.tipo === "fixo";
  if (aFixo !== bFixo) return aFixo ? -1 : 1;

  const aPrazo = a.prazo ?? "9999-99-99";
  const bPrazo = b.prazo ?? "9999-99-99";
  if (aPrazo !== bPrazo) return aPrazo < bPrazo ? -1 : 1;

  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return 0;
}

/** Post-its ainda ativos de um carro (fixo no topo, depois por prazo, depois recencia). */
export async function listAtivasByCarro(supabase: Supabase, carroId: string) {
  const { data, error } = await supabase
    .from("observacoes")
    .select(SELECT_COLUMNS)
    .eq("carro_id", carroId)
    .eq("status", "ativo");

  if (error) {
    throw new ApiHttpError(500, "OBSERVACAO_LIST_FAILED", "Falha ao listar post-its.", error);
  }

  return [...(data ?? [])].sort(comparePostits);
}

/** Post-its ativos mais relevantes (qualquer veiculo) — usado quando nenhuma placa esta selecionada. */
export async function listRecentesAtivas(supabase: Supabase, limit = 15) {
  // Puxa um teto generoso e aplica a ordenacao fina (fixo/prazo/recencia) em JS,
  // garantindo que os fixos e os de prazo mais proximo subam antes do corte.
  const { data, error } = await supabase
    .from("observacoes")
    .select(SELECT_COLUMNS)
    .eq("status", "ativo")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new ApiHttpError(500, "OBSERVACAO_LIST_FAILED", "Falha ao listar post-its.", error);
  }

  return [...(data ?? [])].sort(comparePostits).slice(0, limit);
}

export async function criarObservacao(supabase: Supabase, actor: ActorContext, input: CriarObservacaoInput) {
  const { data, error } = await supabase
    .from("observacoes")
    .insert({
      carro_id: input.carro_id ?? null,
      titulo: input.titulo?.trim() || null,
      tipo: input.tipo,
      texto: input.texto.trim(),
      prazo: input.prazo ?? null,
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

/** Marca um post-it como resolvido. Aceita feedback_solucao opcional. Restricao de cargo e feita no endpoint. */
export async function resolverObservacao(
  supabase: Supabase,
  actor: ActorContext,
  id: string,
  overrides: ResolverObservacaoInput = {}
) {
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

  const updatePayload: Database["public"]["Tables"]["observacoes"]["Update"] = { status: "resolvido" };
  if (overrides.feedback_solucao !== undefined) {
    const trimmed = overrides.feedback_solucao?.trim();
    updatePayload.feedback_solucao = trimmed ? trimmed : null;
  }

  const { data, error } = await supabase
    .from("observacoes")
    .update(updatePayload)
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

/**
 * Atualiza campos editaveis de um post-it (titulo, tipo, texto, prazo,
 * feedback_solucao). VENDEDOR+ pode editar; endpoint controla isso.
 */
export async function atualizarObservacao(
  supabase: Supabase,
  actor: ActorContext,
  id: string,
  input: AtualizarObservacaoInput
) {
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

  const updatePayload: Database["public"]["Tables"]["observacoes"]["Update"] = {};
  if (input.titulo !== undefined) {
    updatePayload.titulo = input.titulo?.trim() ? input.titulo.trim() : null;
  }
  if (input.tipo !== undefined) updatePayload.tipo = input.tipo;
  if (input.texto !== undefined) updatePayload.texto = input.texto.trim();
  if (input.prazo !== undefined) {
    updatePayload.prazo = input.prazo ?? null;
  }
  if (input.feedback_solucao !== undefined) {
    const trimmed = input.feedback_solucao?.trim();
    updatePayload.feedback_solucao = trimmed ? trimmed : null;
  }

  const { data, error } = await supabase
    .from("observacoes")
    .update(updatePayload)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new ApiHttpError(400, "OBSERVACAO_UPDATE_FAILED", "Falha ao atualizar o post-it.", error);
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

/** Apaga um post-it (ADMINISTRADOR). Audit log preserva o estado anterior. */
export async function excluirObservacao(supabase: Supabase, actor: ActorContext, id: string) {
  requireRole(actor, "ADMINISTRADOR");

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

  const { error } = await supabase.from("observacoes").delete().eq("id", id);
  if (error) {
    throw new ApiHttpError(400, "OBSERVACAO_DELETE_FAILED", "Falha ao excluir o post-it.", error);
  }

  await writeAuditLog({
    action: "delete",
    table: "observacoes",
    pk: id,
    actor,
    oldData: toAuditJson(atual)
  });

  return atual;
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
