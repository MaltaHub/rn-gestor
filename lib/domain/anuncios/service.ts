import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { AnuncioInsert, AnuncioRow, Update } from "@/lib/domain/db";
import type { Database } from "@/lib/supabase/database.types";

type DomainSupabase = SupabaseClient<Database>;

type AnuncioPatch = Update<"anuncios">;

export type ListAnunciosInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  estadoAnuncio?: string | null;
};

export type ListAnunciosOutput = {
  rows: Array<Record<string, unknown>>;
  total: number;
};

export type CreateAnuncioInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: {
    anuncio_legado?: boolean;
    carro_id?: string;
    descricao?: string | null;
    estado_anuncio?: string;
    id_anuncio_legado?: string | null;
    valor_anuncio?: number | null;
  };
};

export type CreateAnuncioOutput = AnuncioRow;

export type UpdateAnuncioInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: AnuncioPatch;
  priceChangeContext?: string;
};

export type UpdateAnuncioOutput = AnuncioRow;

export type DeleteAnuncioInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
};

export async function listAnuncios(input: ListAnunciosInput): Promise<ListAnunciosOutput> {
  const { supabase, page, pageSize, estadoAnuncio } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase
    .from("anuncios")
    .select(
      "id, carro_id, estado_anuncio, valor_anuncio, anuncio_legado, id_anuncio_legado, descricao, created_at, carros(placa, nome, preco_original)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (estadoAnuncio?.trim()) {
    query = query.eq("estado_anuncio", estadoAnuncio.trim());
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "ANUNCIOS_LIST_FAILED", "Falha ao listar anuncios.", error);

  return { rows: (data ?? []) as Array<Record<string, unknown>>, total: count ?? 0 };
}

export async function createAnuncio(input: CreateAnuncioInput): Promise<CreateAnuncioOutput> {
  const { supabase, actor, row } = input;

  if (!row.carro_id || !row.estado_anuncio) {
    throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campos obrigatorios: carro_id, estado_anuncio.");
  }

  const payload: AnuncioInsert = {
    anuncio_legado: row.anuncio_legado ?? false,
    carro_id: row.carro_id,
    descricao: row.descricao ?? null,
    estado_anuncio: row.estado_anuncio,
    id_anuncio_legado: row.id_anuncio_legado ?? null,
    valor_anuncio: row.valor_anuncio ?? null
  };

  const { data, error } = await supabase.from("anuncios").insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "ANUNCIO_CREATE_FAILED", "Falha ao criar anuncio.", error);

  await writeAuditLog({
    action: "create",
    table: "anuncios",
    pk: data.id,
    actor,
    newData: data
  });

  return data;
}

export async function updateAnuncio(input: UpdateAnuncioInput): Promise<UpdateAnuncioOutput> {
  const { supabase, actor, id, patch, priceChangeContext } = input;

  const { data: oldData, error: oldError } = await supabase.from("anuncios").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anuncio.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Anuncio nao encontrado.");

  if (Object.prototype.hasOwnProperty.call(patch, "valor_anuncio")) {
    const context = String(priceChangeContext ?? "").trim();
    const oldValue = Number((oldData as Record<string, unknown>).valor_anuncio ?? null);
    const newValue = Number((patch as Record<string, unknown>).valor_anuncio ?? null);
    if (oldValue !== newValue) {
      if (!context) {
        throw new ApiHttpError(400, "PRICE_CHANGE_CONTEXT_REQUIRED", "Explique a alteracao de preco para salvar.");
      }
      await supabase.from("price_change_contexts").insert({
        table_name: "anuncios",
        row_id: id,
        column_name: "valor_anuncio",
        old_value: Number.isFinite(oldValue) ? oldValue : null,
        new_value: Number.isFinite(newValue) ? newValue : null,
        context,
        created_by: actor.userId
      });
    }
  }

  const { data, error } = await supabase.from("anuncios").update(patch).eq("id", id).select("*").single();
  if (error) throw new ApiHttpError(400, "ANUNCIO_UPDATE_FAILED", "Falha ao atualizar anuncio.", error);

  await writeAuditLog({
    action: "update",
    table: "anuncios",
    pk: id,
    actor,
    oldData,
    newData: data
  });

  return data;
}

export async function deleteAnuncio(input: DeleteAnuncioInput): Promise<void> {
  const { supabase, actor, id } = input;

  const { data: oldData, error: oldError } = await supabase.from("anuncios").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anuncio.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Anuncio nao encontrado.");

  const { error } = await supabase.from("anuncios").delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "ANUNCIO_DELETE_FAILED", "Falha ao remover anuncio.", error);

  await writeAuditLog({
    action: "delete",
    table: "anuncios",
    pk: id,
    actor,
    oldData
  });
}
