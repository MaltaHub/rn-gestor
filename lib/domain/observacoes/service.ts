import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActorContext } from "@/lib/api/auth";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

export const OBSERVACAO_TIPOS = ["fixo", "urgente", "observacao"] as const;
export type ObservacaoTipo = (typeof OBSERVACAO_TIPOS)[number];

const SELECT_COLUMNS =
  "id,carro_id,titulo,tipo,texto,status,prazo,autor_auth_user_id,resolvido_em,created_at,updated_at";

export const criarObservacaoSchema = z.object({
  // Opcional: post-it pode existir sem veiculo vinculado (carro_id = null).
  carro_id: z.string().uuid("carro_id invalido.").nullish(),
  // Titulo opcional (rotulo quando nao ha veiculo).
  titulo: z.string().trim().max(120).nullish(),
  tipo: z.enum(OBSERVACAO_TIPOS),
  texto: z.string().trim().min(1, "Escreva a observacao.").max(2000),
  // Prazo opcional no formato YYYY-MM-DD (date).
  prazo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Prazo invalido.")
    .nullish()
});

export type CriarObservacaoInput = z.infer<typeof criarObservacaoSchema>;

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
