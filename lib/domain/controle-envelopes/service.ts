import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type ActorContext, requireRole } from "@/lib/api/auth";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database, Json } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

export const ENVELOPE_ITEMS = ["envelope", "chave_reserva"] as const;
export type EnvelopeItem = (typeof ENVELOPE_ITEMS)[number];

export const ENVELOPE_STATUSES = ["com_usuario", "devolvido"] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

const SELECT_COLUMNS =
  "id,carro_id,item,status,usuario_auth_user_id,observacao,retirado_em,devolvido_em,created_at,updated_at";

const isoDateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "data invalida (use ISO 8601).");

export const registrarRetiradaSchema = z.object({
  carro_id: z.string().uuid("carro_id invalido."),
  item: z.enum(ENVELOPE_ITEMS),
  observacao: z.string().trim().max(500).optional().nullable(),
  // overrides ADM: registrar em nome de outro usuario / hora retroativa
  usuario_auth_user_id: z.string().uuid().optional().nullable(),
  retirado_em: isoDateTime.optional().nullable()
});

export type RegistrarRetiradaInput = z.infer<typeof registrarRetiradaSchema>;

export const registrarDevolucaoSchema = z.object({
  // overrides ADM: marcar devolucao com outro usuario / data retroativa
  usuario_auth_user_id: z.string().uuid().optional().nullable(),
  devolvido_em: isoDateTime.optional().nullable()
});

export type RegistrarDevolucaoInput = z.infer<typeof registrarDevolucaoSchema>;

export const atualizarEnvelopeSchema = z
  .object({
    item: z.enum(ENVELOPE_ITEMS).optional(),
    status: z.enum(ENVELOPE_STATUSES).optional(),
    usuario_auth_user_id: z.string().uuid().nullable().optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
    retirado_em: isoDateTime.optional(),
    devolvido_em: isoDateTime.nullable().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, "Nada para atualizar.");

export type AtualizarEnvelopeInput = z.infer<typeof atualizarEnvelopeSchema>;

function hasAdminOverride(input: { usuario_auth_user_id?: string | null; retirado_em?: string | null; devolvido_em?: string | null }) {
  // Tratamos null explicito como override (ADM removendo o autor, por exemplo).
  return input.usuario_auth_user_id !== undefined || input.retirado_em != null || input.devolvido_em != null;
}

/** Lista retiradas de um carro. Por padrao so as abertas; com includeClosed devolve tambem as fechadas. */
export async function listEnvelopesByCarro(
  supabase: Supabase,
  carroId: string,
  options: { includeClosed?: boolean } = {}
) {
  let query = supabase.from("controle_envelopes").select(SELECT_COLUMNS).eq("carro_id", carroId);
  if (!options.includeClosed) {
    query = query.eq("status", "com_usuario");
  }
  const { data, error } = await query.order("retirado_em", { ascending: false });

  if (error) {
    throw new ApiHttpError(500, "ENVELOPE_LIST_FAILED", "Falha ao consultar retiradas.", error);
  }

  return data ?? [];
}

/** Atalho compat: so abertos (status=com_usuario). */
export async function listEnvelopesAbertosByCarro(supabase: Supabase, carroId: string) {
  return listEnvelopesByCarro(supabase, carroId, { includeClosed: false });
}

/**
 * Registra a retirada de um item. Bloqueia se ja existir uma retirada aberta
 * do mesmo item para o mesmo carro (regra de negocio). O indice unico parcial
 * no banco e o backstop contra corridas.
 *
 * Overrides ADM (usuario_auth_user_id, retirado_em) exigem role ADMINISTRADOR.
 */
export async function registrarRetirada(supabase: Supabase, actor: ActorContext, input: RegistrarRetiradaInput) {
  if (hasAdminOverride(input)) {
    requireRole(actor, "ADMINISTRADOR");
  }

  const abertos = await listEnvelopesAbertosByCarro(supabase, input.carro_id);
  const jaAberto = abertos.find((row) => row.item === input.item);
  if (jaAberto) {
    throw new ApiHttpError(
      409,
      "ENVELOPE_JA_RETIRADO",
      `Este ${input.item === "envelope" ? "envelope" : "chave reserva"} ja esta com um usuario. Registre a devolucao antes de retirar de novo.`,
      { aberto: jaAberto }
    );
  }

  const usuarioAuthUserId = input.usuario_auth_user_id !== undefined ? input.usuario_auth_user_id : actor.authUserId;
  const insertPayload: Database["public"]["Tables"]["controle_envelopes"]["Insert"] = {
    carro_id: input.carro_id,
    item: input.item,
    status: "com_usuario",
    usuario_auth_user_id: usuarioAuthUserId,
    observacao: input.observacao?.trim() || null
  };
  if (input.retirado_em) {
    insertPayload.retirado_em = input.retirado_em;
  }

  const { data, error } = await supabase
    .from("controle_envelopes")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "ENVELOPE_JA_RETIRADO",
        "Este item acabou de ser retirado por outro usuario. Atualize e tente novamente.",
        error
      );
    }
    throw new ApiHttpError(400, "ENVELOPE_RETIRADA_FAILED", "Falha ao registrar a retirada.", error);
  }

  await writeAuditLog({ action: "create", table: "controle_envelopes", pk: data.id, actor, newData: toAuditJson(data as unknown as Json) });
  return data;
}

/**
 * Fecha (devolve) uma retirada aberta pelo id.
 * Overrides ADM (usuario_auth_user_id, devolvido_em) exigem role ADMINISTRADOR.
 */
export async function registrarDevolucao(
  supabase: Supabase,
  actor: ActorContext,
  id: string,
  overrides: RegistrarDevolucaoInput = {}
) {
  if (hasAdminOverride(overrides)) {
    requireRole(actor, "ADMINISTRADOR");
  }

  const { data: atual, error: readError } = await supabase
    .from("controle_envelopes")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    throw new ApiHttpError(400, "ENVELOPE_READ_FAILED", "Falha ao carregar a retirada.", readError);
  }
  if (!atual) {
    throw new ApiHttpError(404, "NOT_FOUND", "Retirada nao encontrada.", { id });
  }
  if (atual.status === "devolvido") {
    throw new ApiHttpError(409, "ENVELOPE_JA_DEVOLVIDO", "Esta retirada ja foi devolvida.", { id });
  }

  const updatePayload: Database["public"]["Tables"]["controle_envelopes"]["Update"] = { status: "devolvido" };
  if (overrides.usuario_auth_user_id !== undefined) {
    updatePayload.usuario_auth_user_id = overrides.usuario_auth_user_id;
  }
  if (overrides.devolvido_em) {
    updatePayload.devolvido_em = overrides.devolvido_em;
  }

  const { data, error } = await supabase
    .from("controle_envelopes")
    .update(updatePayload)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new ApiHttpError(400, "ENVELOPE_DEVOLUCAO_FAILED", "Falha ao registrar a devolucao.", error);
  }

  await writeAuditLog({
    action: "update",
    table: "controle_envelopes",
    pk: id,
    actor,
    oldData: toAuditJson(atual as unknown as Json),
    newData: toAuditJson(data as unknown as Json)
  });
  return data;
}

/**
 * Atualiza uma linha de retirada (ADMINISTRADOR). Permite mudar usuario, datas,
 * status, item e observacao. Toda mudanca passa por audit log.
 */
export async function atualizarEnvelope(
  supabase: Supabase,
  actor: ActorContext,
  id: string,
  input: AtualizarEnvelopeInput
) {
  requireRole(actor, "ADMINISTRADOR");

  const { data: atual, error: readError } = await supabase
    .from("controle_envelopes")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    throw new ApiHttpError(400, "ENVELOPE_READ_FAILED", "Falha ao carregar a retirada.", readError);
  }
  if (!atual) {
    throw new ApiHttpError(404, "NOT_FOUND", "Retirada nao encontrada.", { id });
  }

  const updatePayload: Database["public"]["Tables"]["controle_envelopes"]["Update"] = {};
  if (input.item !== undefined) updatePayload.item = input.item;
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.usuario_auth_user_id !== undefined) updatePayload.usuario_auth_user_id = input.usuario_auth_user_id;
  if (input.observacao !== undefined) {
    updatePayload.observacao = input.observacao?.trim() || null;
  }
  if (input.retirado_em !== undefined) updatePayload.retirado_em = input.retirado_em;
  if (input.devolvido_em !== undefined) updatePayload.devolvido_em = input.devolvido_em;

  const { data, error } = await supabase
    .from("controle_envelopes")
    .update(updatePayload)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "ENVELOPE_JA_RETIRADO",
        "Ja existe uma retirada aberta deste item para o veiculo.",
        error
      );
    }
    throw new ApiHttpError(400, "ENVELOPE_UPDATE_FAILED", "Falha ao atualizar a retirada.", error);
  }

  await writeAuditLog({
    action: "update",
    table: "controle_envelopes",
    pk: id,
    actor,
    oldData: toAuditJson(atual as unknown as Json),
    newData: toAuditJson(data as unknown as Json)
  });
  return data;
}

/** Apaga uma linha de retirada (ADMINISTRADOR). Audit log preserva o estado anterior. */
export async function excluirEnvelope(supabase: Supabase, actor: ActorContext, id: string) {
  requireRole(actor, "ADMINISTRADOR");

  const { data: atual, error: readError } = await supabase
    .from("controle_envelopes")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    throw new ApiHttpError(400, "ENVELOPE_READ_FAILED", "Falha ao carregar a retirada.", readError);
  }
  if (!atual) {
    throw new ApiHttpError(404, "NOT_FOUND", "Retirada nao encontrada.", { id });
  }

  const { error } = await supabase.from("controle_envelopes").delete().eq("id", id);
  if (error) {
    throw new ApiHttpError(400, "ENVELOPE_DELETE_FAILED", "Falha ao excluir a retirada.", error);
  }

  await writeAuditLog({
    action: "delete",
    table: "controle_envelopes",
    pk: id,
    actor,
    oldData: toAuditJson(atual as unknown as Json)
  });

  return atual;
}
