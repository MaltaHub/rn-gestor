import type { SupabaseClient } from "@supabase/supabase-js";
import { isApprovedAccessStatus } from "@/lib/api/access-users";
import type { ActorContext } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { hasRequiredRole, type AppRole } from "@/lib/domain/access";
import type { Database } from "@/lib/supabase/database.types";
import { EMPTY_LOOKUPS, type LookupItem, type LookupsPayload } from "@/lib/core/types";

// Dominios nao sensiveis ficam todos em public.lookups (uma linha por (domain, code)).
// A chave do payload e identica ao `domain` na tabela unificada.
type UnifiedLookupSpec = { key: keyof LookupsPayload; domain: string; minRole: AppRole };

// Lookups que seguem em tabelas proprias: status (FKs do core de carros/anuncios,
// editaveis no grid) e os sensiveis (RBAC, lidos por funcoes de seguranca).
type StandaloneLookupSpec = {
  key: keyof LookupsPayload;
  table:
    | "lookup_sale_statuses"
    | "lookup_announcement_statuses"
    | "lookup_locations"
    | "lookup_vehicle_states"
    | "lookup_user_roles"
    | "lookup_user_statuses";
  minRole: AppRole;
};

// Dominios unificados em public.lookups (Set 1) que aparecem no payload.
// Mesmos codigos que o parser de documentos usa (FK no banco).
const UNIFIED_LOOKUP_SPECS: UnifiedLookupSpec[] = [
  { key: "canais_cliente", domain: "canais_cliente", minRole: "VENDEDOR" },
  { key: "tipos_processo", domain: "tipos_processo", minRole: "VENDEDOR" },
  { key: "propositos", domain: "propositos", minRole: "VENDEDOR" },
  { key: "estados_pericia", domain: "estados_pericia", minRole: "VENDEDOR" },
  { key: "estados_chave_reserva", domain: "estados_chave_reserva", minRole: "VENDEDOR" },
  { key: "estados_transferencia", domain: "estados_transferencia", minRole: "VENDEDOR" }
];

const STANDALONE_LOOKUP_SPECS: StandaloneLookupSpec[] = [
  { key: "sale_statuses", table: "lookup_sale_statuses", minRole: "VENDEDOR" },
  { key: "announcement_statuses", table: "lookup_announcement_statuses", minRole: "VENDEDOR" },
  { key: "locations", table: "lookup_locations", minRole: "VENDEDOR" },
  { key: "vehicle_states", table: "lookup_vehicle_states", minRole: "VENDEDOR" },
  { key: "user_roles", table: "lookup_user_roles", minRole: "ADMINISTRADOR" },
  { key: "user_statuses", table: "lookup_user_statuses", minRole: "ADMINISTRADOR" }
];

/**
 * Le os dominios unificados (public.lookups) numa unica query, ja filtrando por
 * is_active e pelos dominios que o papel do ator pode ver. Retorna agrupado por dominio.
 */
async function fetchUnifiedLookups(
  supabase: SupabaseClient<Database>,
  domains: string[]
): Promise<Map<string, LookupItem[]>> {
  const grouped = new Map<string, LookupItem[]>();
  if (!domains.length) return grouped;

  const { data, error } = await supabase
    .from("lookups")
    .select("domain, code, name")
    .eq("is_active", true)
    .in("domain", domains)
    .order("domain", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "LOOKUPS_FETCH_FAILED", "Falha ao carregar tabelas de dominio.", {
      table: "lookups",
      error
    });
  }

  for (const row of data ?? []) {
    const bucket = grouped.get(row.domain) ?? [];
    bucket.push({ code: row.code, name: row.name });
    grouped.set(row.domain, bucket);
  }

  return grouped;
}

async function fetchStandaloneLookupTable(
  supabase: SupabaseClient<Database>,
  table: StandaloneLookupSpec["table"]
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
  const allowedUnified = UNIFIED_LOOKUP_SPECS.filter((spec) => hasRequiredRole(params.actor.role, spec.minRole));
  const allowedDomains = allowedUnified.map((spec) => spec.domain);

  const [unifiedByDomain, standaloneEntries, usuarios] = await Promise.all([
    fetchUnifiedLookups(params.supabase, allowedDomains),
    Promise.all(
      STANDALONE_LOOKUP_SPECS.map(async (spec) => {
        if (!hasRequiredRole(params.actor.role, spec.minRole)) {
          return [spec.key, [] as LookupItem[]] as const;
        }

        const rows = await fetchStandaloneLookupTable(params.supabase, spec.table);
        return [spec.key, rows] as const;
      })
    ),
    // Qualquer usuario autenticado pode listar usuarios para escolher o
    // vendedor de uma venda (qualquer usuario pode ser indicado como vendedor).
    fetchUsuariosLookup(params.supabase)
  ]);

  const payload: LookupsPayload = { ...EMPTY_LOOKUPS };

  for (const spec of allowedUnified) {
    payload[spec.key] = unifiedByDomain.get(spec.domain) ?? [];
  }

  for (const [key, rows] of standaloneEntries) {
    payload[key] = rows;
  }

  payload.usuarios = usuarios;

  return payload;
}
