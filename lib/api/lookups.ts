import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { hasRequiredRole, type AppRole } from "@/lib/domain/access";
import type { Database } from "@/lib/supabase/database.types";
import { EMPTY_LOOKUPS, type LookupItem, type LookupsPayload } from "@/lib/core/types";

type LookupSpec = {
  key: keyof LookupsPayload;
  table:
    | "lookup_announcement_statuses"
    | "lookup_locations"
    | "lookup_sale_statuses"
    | "lookup_user_roles"
    | "lookup_user_statuses"
    | "lookup_vehicle_states";
  minRole: AppRole;
};

const LOOKUP_SPECS: LookupSpec[] = [
  { key: "sale_statuses", table: "lookup_sale_statuses", minRole: "VENDEDOR" },
  { key: "announcement_statuses", table: "lookup_announcement_statuses", minRole: "VENDEDOR" },
  { key: "locations", table: "lookup_locations", minRole: "VENDEDOR" },
  { key: "vehicle_states", table: "lookup_vehicle_states", minRole: "VENDEDOR" },
  { key: "user_roles", table: "lookup_user_roles", minRole: "ADMINISTRADOR" },
  { key: "user_statuses", table: "lookup_user_statuses", minRole: "ADMINISTRADOR" }
];

async function fetchActiveLookupTable(
  supabase: SupabaseClient<Database>,
  table: LookupSpec["table"]
): Promise<LookupItem[]> {
  const { data, error } = await supabase.from(table).select("code, name").eq("is_active", true).order("sort_order");

  if (error) {
    throw new ApiHttpError(500, "LOOKUPS_FETCH_FAILED", "Falha ao carregar tabelas de dominio.", {
      table,
      error
    });
  }

  return data ?? [];
}

export async function fetchLookupsForActor(params: {
  actor: ActorContext;
  supabase: SupabaseClient<Database>;
}): Promise<LookupsPayload> {
  const entries = await Promise.all(
    LOOKUP_SPECS.map(async (spec) => {
      if (!hasRequiredRole(params.actor.role, spec.minRole)) {
        return [spec.key, [] as LookupItem[]] as const;
      }

      const rows = await fetchActiveLookupTable(params.supabase, spec.table);
      return [spec.key, rows] as const;
    })
  );

  return entries.reduce<LookupsPayload>((acc, [key, rows]) => {
    acc[key] = rows;
    return acc;
  }, { ...EMPTY_LOOKUPS });
}
