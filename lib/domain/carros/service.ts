import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { CarroInsert, CarroRow, CarroUpdate } from "@/lib/domain/db";
import { enrichCarroInsertPayload } from "@/lib/domain/carros-enrichment";
import {
  ensureVehicleFileAutomations,
  handleVehicleBeforeDeleteFileAutomations
} from "@/lib/domain/file-automations/service";
import type { Database } from "@/lib/supabase/database.types";

type DomainSupabase = SupabaseClient<Database>;

const DEFAULT_ESTADO_VEICULO = "PREPARAÇÃO";
const DEFAULT_ESTADO_ANUNCIO = "AUSENTE";

function normalizeStatusOrDefault(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export type ListCarrosInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  q?: string | null;
  local?: string | null;
  estadoVenda?: string | null;
};

export type ListCarrosOutput = {
  rows: Array<Record<string, unknown>>;
  total: number;
};

export type ReadCarroInput = {
  supabase: DomainSupabase;
  id: string;
};

export type ReadCarroOutput = CarroRow & {
  modelos?: unknown;
  anuncios?: unknown;
};

export type CreateCarroInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: Partial<CarroInsert>;
};

export type CreateCarroOutput = CarroRow;

export type UpdateCarroInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: CarroUpdate & {
    atpv_e?: unknown;
    laudo?: unknown;
    priceChangeContext?: unknown;
  };
  priceChangeContext?: string;
};

export type UpdateCarroOutput = CarroRow;

export type DeleteCarroInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
};

export async function listCarros(input: ListCarrosInput): Promise<ListCarrosOutput> {
  const { supabase, page, pageSize, q, local, estadoVenda } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase
    .from("carros")
    .select("id, placa, chassi, nome, local, estado_venda, em_estoque, tem_fotos, modelo_id, data_entrada, created_at, modelos(modelo)", {
      count: "exact"
    })
    .order("created_at", { ascending: false });

  if (q?.trim()) {
    query = query.or(`placa.ilike.%${q.trim()}%,nome.ilike.%${q.trim()}%`);
  }

  if (local?.trim()) {
    query = query.eq("local", local.trim());
  }

  if (estadoVenda?.trim()) {
    query = query.eq("estado_venda", estadoVenda.trim());
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "CARROS_LIST_FAILED", "Falha ao listar carros.", error);

  return { rows: (data ?? []) as Array<Record<string, unknown>>, total: count ?? 0 };
}

export async function readCarroById(input: ReadCarroInput): Promise<ReadCarroOutput> {
  const { supabase, id } = input;

  const { data, error } = await supabase.from("carros").select("*, modelos(modelo), anuncios(*)").eq("id", id).maybeSingle();

  if (error) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", error);
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  return data as ReadCarroOutput;
}

export async function createCarro(input: CreateCarroInput): Promise<CreateCarroOutput> {
  const { supabase, actor, row } = input;

  const { payload: enrichedPayload, consultaPlaca, consultaPlacaErro } = await enrichCarroInsertPayload({
    supabase,
    row: row as Record<string, unknown>
  });

  const payload: CarroInsert = {
    ...(enrichedPayload as Partial<CarroInsert>),
    em_estoque: row.em_estoque ?? true,
    estado_veiculo: normalizeStatusOrDefault(row.estado_veiculo, DEFAULT_ESTADO_VEICULO),
    estado_anuncio: normalizeStatusOrDefault(row.estado_anuncio, DEFAULT_ESTADO_ANUNCIO)
  } as CarroInsert;

  const { data, error } = await supabase.from("carros").insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "CARRO_CREATE_FAILED", "Falha ao criar carro.", error);

  await writeAuditLog({
    action: "create",
    table: "carros",
    pk: data.id,
    actor,
    newData: {
      ...data,
      consulta_placa: toAuditJson(consultaPlaca),
      consulta_placa_erro: consultaPlacaErro
    }
  });

  await ensureVehicleFileAutomations(supabase, data.id);

  return data;
}

export async function updateCarro(input: UpdateCarroInput): Promise<UpdateCarroOutput> {
  const { supabase, actor, id, priceChangeContext } = input;
  const patch = { ...input.patch };

  delete patch.atpv_e;
  delete patch.laudo;
  delete patch.priceChangeContext;

  if (patch.placa) {
    patch.placa = patch.placa.trim().toUpperCase();
  }

  if (Object.prototype.hasOwnProperty.call(patch, "estado_veiculo")) {
    patch.estado_veiculo = normalizeStatusOrDefault(patch.estado_veiculo, DEFAULT_ESTADO_VEICULO);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "estado_anuncio")) {
    patch.estado_anuncio = normalizeStatusOrDefault(patch.estado_anuncio, DEFAULT_ESTADO_ANUNCIO);
  }

  const { data: oldData, error: oldError } = await supabase.from("carros").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  if (Object.prototype.hasOwnProperty.call(patch, "preco_original")) {
    const context = String(priceChangeContext ?? "").trim();
    const oldValue = Number((oldData as Record<string, unknown>).preco_original ?? null);
    const newValue = Number((patch as Record<string, unknown>).preco_original ?? null);
    if (oldValue !== newValue) {
      if (!context) {
        throw new ApiHttpError(400, "PRICE_CHANGE_CONTEXT_REQUIRED", "Explique a alteracao de preco para salvar.");
      }
      await supabase.from("price_change_contexts").insert({
        table_name: "carros",
        row_id: id,
        column_name: "preco_original",
        old_value: Number.isFinite(oldValue) ? oldValue : null,
        new_value: Number.isFinite(newValue) ? newValue : null,
        context,
        created_by: actor.userId
      });
    }
  }

  const { data, error } = await supabase.from("carros").update(patch).eq("id", id).select("*").single();
  if (error) throw new ApiHttpError(400, "CARRO_UPDATE_FAILED", "Falha ao atualizar carro.", error);

  await writeAuditLog({
    action: "update",
    table: "carros",
    pk: id,
    actor,
    oldData,
    newData: data
  });

  const temFotos = await ensureVehicleFileAutomations(supabase, data.id);

  return {
    ...data,
    tem_fotos: temFotos
  };
}

export async function deleteCarro(input: DeleteCarroInput): Promise<void> {
  const { supabase, actor, id } = input;

  const { data: oldData, error: oldError } = await supabase.from("carros").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  await handleVehicleBeforeDeleteFileAutomations(supabase, id);

  const { error } = await supabase.from("carros").delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "CARRO_DELETE_FAILED", "Falha ao remover carro.", error);

  await writeAuditLog({
    action: "delete",
    table: "carros",
    pk: id,
    actor,
    oldData
  });
}
