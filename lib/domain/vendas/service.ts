import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { VendaInsert, VendaRow, VendaUpdate } from "@/lib/domain/db";
import type { Database } from "@/lib/supabase/database.types";
import type { VendaCreateInput, VendaUpdateInput } from "@/lib/domain/vendas/schemas";

type DomainSupabase = SupabaseClient<Database>;

export type ListVendasInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  estadoVenda?: string | null;
  vendedorAuthUserId?: string | null;
  carroId?: string | null;
};

export type ListVendasOutput = {
  rows: Array<Record<string, unknown>>;
  total: number;
};

export type CreateVendaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: VendaCreateInput;
};

export type UpdateVendaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: VendaUpdateInput;
};

export type DeleteVendaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
};

export async function listVendas(input: ListVendasInput): Promise<ListVendasOutput> {
  const { supabase, page, pageSize, estadoVenda, vendedorAuthUserId, carroId } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase
    .from("vendas")
    .select(
      "*, carros(placa, nome, modelo_id, cor, ano_mod, ano_fab, preco_original)",
      { count: "exact" }
    )
    .order("data_venda", { ascending: false })
    .order("created_at", { ascending: false });

  if (estadoVenda?.trim()) {
    query = query.eq("estado_venda", estadoVenda.trim());
  }
  if (vendedorAuthUserId?.trim()) {
    query = query.eq("vendedor_auth_user_id", vendedorAuthUserId.trim());
  }
  if (carroId?.trim()) {
    query = query.eq("carro_id", carroId.trim());
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "VENDAS_LIST_FAILED", "Falha ao listar vendas.", error);

  return { rows: (data ?? []) as Array<Record<string, unknown>>, total: count ?? 0 };
}

export async function createVenda(input: CreateVendaInput): Promise<VendaRow> {
  const { supabase, actor, row } = input;

  // created_by_user_id referencia auth.users(id), entao usamos authUserId
  // (nao userId, que e usuarios_acesso.id) para nao violar a FK.
  const payload: VendaInsert = {
    ...row,
    created_by_user_id: actor.authUserId
  };

  const { data, error } = await supabase.from("vendas").insert(payload).select("*").single();
  if (error) {
    // 23505 = unique_violation (ux_vendas_carro_concluida)
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "VENDA_CARRO_JA_VENDIDO",
        "Ja existe uma venda concluida para este carro. Cancele a anterior antes de registrar outra.",
        error
      );
    }
    throw new ApiHttpError(400, "VENDA_CREATE_FAILED", "Falha ao registrar venda.", error);
  }

  await writeAuditLog({
    action: "create",
    table: "vendas",
    pk: data.id,
    actor,
    newData: data
  });

  return data;
}

export async function updateVenda(input: UpdateVendaInput): Promise<VendaRow> {
  const { supabase, actor, id, patch } = input;

  const { data: oldData, error: oldError } = await supabase
    .from("vendas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oldError) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Venda nao encontrada.");

  const updates: VendaUpdate = { ...patch };

  const { data, error } = await supabase
    .from("vendas")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "VENDA_CARRO_JA_VENDIDO",
        "Ja existe outra venda concluida para este carro.",
        error
      );
    }
    throw new ApiHttpError(400, "VENDA_UPDATE_FAILED", "Falha ao atualizar venda.", error);
  }

  await writeAuditLog({
    action: "update",
    table: "vendas",
    pk: id,
    actor,
    oldData,
    newData: data
  });

  return data;
}

export async function deleteVenda(input: DeleteVendaInput): Promise<void> {
  const { supabase, actor, id } = input;

  const { data: oldData, error: oldError } = await supabase
    .from("vendas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oldError) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Venda nao encontrada.");

  const { error } = await supabase.from("vendas").delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "VENDA_DELETE_FAILED", "Falha ao remover venda.", error);

  await writeAuditLog({
    action: "delete",
    table: "vendas",
    pk: id,
    actor,
    oldData
  });
}
