import type { SupabaseClient } from "@supabase/supabase-js";
import { isApprovedAccessStatus } from "@/lib/api/access-users";
import type { ActorContext } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { hasRequiredRole, type AppRole } from "@/lib/domain/access";
import type { Database } from "@/lib/supabase/database.types";
import { EMPTY_LOOKUPS, type LookupItem, type LookupsPayload } from "@/lib/core/types";

type LookupSpec = {
  key: keyof LookupsPayload;
  table:
    | "lookup_announcement_statuses"
    | "lookup_canais_cliente"
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
  { key: "canais_cliente", table: "lookup_canais_cliente", minRole: "VENDEDOR" },
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

/**
 * Lista usuarios aprovados com auth_user_id (pre-requisito para serem
 * selecionaveis como vendedor em uma venda). Retorna { code: auth_user_id, name: nome }.
 */
async function fetchUsuariosLookup(
  supabase: SupabaseClient<Database>
): Promise<LookupItem[]> {
  const { data, error } = await supabase
    .from("usuarios_acesso")
    .select("auth_user_id, nome, status")
    .not("auth_user_id", "is", null)
    .order("nome", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "LOOKUPS_FETCH_FAILED", "Falha ao carregar usuarios.", {
      table: "usuarios_acesso",
      error
    });
  }

  return (data ?? [])
    .filter((row) => isApprovedAccessStatus(row.status))
    .map((row) => ({
      code: row.auth_user_id as string,
      name: (row.nome ?? "").trim() || "Usuario sem nome"
    }));
}

export async function fetchLookupsForActor(params: {
  actor: ActorContext;
  supabase: SupabaseClient<Database>;
}): Promise<LookupsPayload> {
  const [tableEntries, usuarios] = await Promise.all([
    Promise.all(
      LOOKUP_SPECS.map(async (spec) => {
        if (!hasRequiredRole(params.actor.role, spec.minRole)) {
          return [spec.key, [] as LookupItem[]] as const;
        }

        const rows = await fetchActiveLookupTable(params.supabase, spec.table);
        return [spec.key, rows] as const;
      })
    ),
    // Qualquer usuario autenticado pode listar usuarios para escolher o
    // vendedor de uma venda (qualquer usuario pode ser indicado como vendedor).
    fetchUsuariosLookup(params.supabase)
  ]);

  const payload = tableEntries.reduce<LookupsPayload>((acc, [key, rows]) => {
    acc[key] = rows;
    return acc;
  }, { ...EMPTY_LOOKUPS });

  payload.usuarios = usuarios;

  return payload;
}
