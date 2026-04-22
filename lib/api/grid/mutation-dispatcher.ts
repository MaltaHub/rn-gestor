import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext } from "@/lib/api/auth";
import { createAnuncio, deleteAnuncio, updateAnuncio } from "@/lib/domain/anuncios/service";
import { createCarro, deleteCarro, updateCarro } from "@/lib/domain/carros/service";
import { createModelo, deleteModelo, updateModelo } from "@/lib/domain/modelos/service";
import type { Database } from "@/lib/supabase/database.types";

type GridSupabase = SupabaseClient<Database>;
type MutationTable = "carros" | "anuncios" | "modelos";

export function isDomainMutationTable(table: string): table is MutationTable {
  return table === "carros" || table === "anuncios" || table === "modelos";
}

export async function dispatchGridDomainUpdate(input: {
  table: MutationTable;
  supabase: GridSupabase;
  actor: ActorContext;
  id: string;
  patch: Record<string, unknown>;
  priceChangeContext?: string;
}) {
  const { table, supabase, actor, id, patch, priceChangeContext } = input;

  if (table === "carros") {
    return updateCarro({ supabase, actor, id, patch, priceChangeContext });
  }

  if (table === "anuncios") {
    return updateAnuncio({ supabase, actor, id, patch, priceChangeContext });
  }

  return updateModelo({
    supabase,
    actor,
    id,
    row: patch as { modelo?: string }
  });
}

export async function dispatchGridDomainCreate(input: {
  table: MutationTable;
  supabase: GridSupabase;
  actor: ActorContext;
  row: Record<string, unknown>;
}) {
  const { table, supabase, actor, row } = input;

  if (table === "carros") {
    return createCarro({ supabase, actor, row });
  }

  if (table === "anuncios") {
    return createAnuncio({ supabase, actor, row });
  }

  return createModelo({ supabase, actor, row });
}


export async function dispatchGridDomainDelete(input: {
  table: MutationTable;
  supabase: GridSupabase;
  actor: ActorContext;
  id: string;
}) {
  const { table, supabase, actor, id } = input;

  if (table === "carros") {
    return deleteCarro({ supabase, actor, id });
  }

  if (table === "anuncios") {
    return deleteAnuncio({ supabase, actor, id });
  }

  return deleteModelo({ supabase, actor, id });
}
