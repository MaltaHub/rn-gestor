import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { Database } from "@/lib/supabase/database.types";
import type { ModeloInsert, ModeloRow } from "@/lib/domain/db";

type DomainSupabase = SupabaseClient<Database>;

export type ListModelosInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  q?: string | null;
};

export type ListModelosOutput = {
  rows: ModeloRow[];
  total: number;
};

export type CreateModeloInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: Partial<ModeloInsert>;
};

export type UpdateModeloInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  row: { modelo?: string };
};

export type DeleteModeloInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
};

export async function listModelos(input: ListModelosInput): Promise<ListModelosOutput> {
  const { supabase, page, pageSize, q } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase.from("modelos").select("*", { count: "exact" }).order("modelo", { ascending: true });

  if (q?.trim()) {
    query = query.ilike("modelo", `%${q.trim()}%`);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "MODELOS_LIST_FAILED", "Falha ao listar modelos.", error);

  return { rows: (data ?? []) as ModeloRow[], total: count ?? 0 };
}

export async function createModelo(input: CreateModeloInput): Promise<ModeloRow> {
  const { supabase, actor, row } = input;

  if (!row.modelo || !row.modelo.trim()) {
    throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campo 'modelo' e obrigatorio.");
  }

  const payload: ModeloInsert = { modelo: row.modelo.trim() };

  const { data, error } = await supabase.from("modelos").insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "MODELO_CREATE_FAILED", "Falha ao criar modelo.", error);

  await writeAuditLog({
    action: "create",
    table: "modelos",
    pk: data.id,
    actor,
    newData: data
  });

  return data;
}

export async function updateModelo(input: UpdateModeloInput): Promise<ModeloRow> {
  const { supabase, actor, id, row } = input;

  if (!row.modelo || !row.modelo.trim()) {
    throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campo 'modelo' e obrigatorio.");
  }

  const { data: oldData, error: oldError } = await supabase.from("modelos").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "MODELO_READ_FAILED", "Falha ao ler modelo.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Modelo nao encontrado.");

  const { data, error } = await supabase.from("modelos").update({ modelo: row.modelo.trim() }).eq("id", id).select("*").single();

  if (error) throw new ApiHttpError(400, "MODELO_UPDATE_FAILED", "Falha ao atualizar modelo.", error);

  await writeAuditLog({ action: "update", table: "modelos", pk: id, actor, oldData, newData: data });

  return data;
}

export async function deleteModelo(input: DeleteModeloInput): Promise<void> {
  const { supabase, actor, id } = input;

  const { data: oldData, error: oldError } = await supabase.from("modelos").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "MODELO_READ_FAILED", "Falha ao ler modelo.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Modelo nao encontrado.");

  const { error } = await supabase.from("modelos").delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "MODELO_DELETE_FAILED", "Falha ao remover modelo.", error);

  await writeAuditLog({
    action: "delete",
    table: "modelos",
    pk: id,
    actor,
    oldData
  });
}
