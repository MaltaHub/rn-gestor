import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActorContext } from "@/lib/api/auth";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database, Json } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

export const ENVELOPE_ITEMS = ["envelope", "chave_reserva"] as const;
export type EnvelopeItem = (typeof ENVELOPE_ITEMS)[number];

const SELECT_COLUMNS =
  "id,carro_id,item,status,usuario_auth_user_id,observacao,retirado_em,devolvido_em,created_at,updated_at";

export const registrarRetiradaSchema = z.object({
  carro_id: z.string().uuid("carro_id invalido."),
  item: z.enum(ENVELOPE_ITEMS),
  observacao: z.string().trim().max(500).optional().nullable()
});

export type RegistrarRetiradaInput = z.infer<typeof registrarRetiradaSchema>;

/** Retiradas ainda em posse de alguem (status=com_usuario) para um carro. */
export async function listEnvelopesAbertosByCarro(supabase: Supabase, carroId: string) {
  const { data, error } = await supabase
    .from("controle_envelopes")
    .select(SELECT_COLUMNS)
    .eq("carro_id", carroId)
    .eq("status", "com_usuario")
    .order("retirado_em", { ascending: false });

  if (error) {
    throw new ApiHttpError(500, "ENVELOPE_LIST_FAILED", "Falha ao consultar retiradas abertas.", error);
  }

  return data ?? [];
}

/**
 * Registra a retirada de um item. Bloqueia se ja existir uma retirada aberta
 * do mesmo item para o mesmo carro (regra de negocio). O indice unico parcial
 * no banco e o backstop contra corridas.
 */
export async function registrarRetirada(supabase: Supabase, actor: ActorContext, input: RegistrarRetiradaInput) {
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

  const { data, error } = await supabase
    .from("controle_envelopes")
    .insert({
      carro_id: input.carro_id,
      item: input.item,
      status: "com_usuario",
      usuario_auth_user_id: actor.authUserId,
      observacao: input.observacao?.trim() || null
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // Violacao do indice unico parcial (corrida): trata como regra de negocio.
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

/** Fecha (devolve) uma retirada aberta pelo id. */
export async function registrarDevolucao(supabase: Supabase, actor: ActorContext, id: string) {
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

  const { data, error } = await supabase
    .from("controle_envelopes")
    .update({ status: "devolvido" })
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
