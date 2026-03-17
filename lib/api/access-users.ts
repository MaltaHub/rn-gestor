import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { AppRole } from "@/lib/domain/access";
import type { Database } from "@/lib/supabase/database.types";

type ApiSupabase = SupabaseClient<Database>;

const ACCESS_USER_SELECT =
  "id, auth_user_id, nome, email, cargo, status, foto, obs, ultimo_login, aprovado_em, created_at, updated_at";

const ROLE_LOOKUP_HINTS: Record<AppRole, string[]> = {
  VENDEDOR: ["VENDEDOR", "VENDOR", "COMERCIAL"],
  SECRETARIO: ["SECRETARIO", "SECRETARIA", "ASSISTENTE"],
  GERENTE: ["GERENTE", "MANAGER"],
  ADMINISTRADOR: ["ADMINISTRADOR", "ADMIN", "ROOT"]
};

const APPROVED_STATUS_HINTS = ["APROVADO", "APPROVED", "ATIVO", "ACTIVE"];
const PENDING_STATUS_HINTS = ["PENDENTE", "PENDING", "AGUARDANDO"];

type AccessUserRow = Database["public"]["Tables"]["usuarios_acesso"]["Row"];
type AccessUserUpdate = Database["public"]["Tables"]["usuarios_acesso"]["Update"];
type LookupTableName = "lookup_user_roles" | "lookup_user_statuses";
type LookupRow = {
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type AdminAccessUser = Pick<
  AccessUserRow,
  "id" | "auth_user_id" | "nome" | "email" | "cargo" | "status" | "foto" | "obs" | "ultimo_login" | "aprovado_em" | "created_at" | "updated_at"
>;

export type AccessLookupOption = {
  code: string;
  name: string;
};

function normalizeLookupText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function matchesAnyHint(value: string | null | undefined, hints: string[]) {
  const normalized = normalizeLookupText(value);
  if (!normalized) return false;

  return hints.some((hint) => {
    const candidate = normalizeLookupText(hint);
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  });
}

function buildFallbackName(email: string | null, preferredName?: string | null) {
  const trimmedName = String(preferredName ?? "").trim();
  if (trimmedName) return trimmedName;

  const normalizedEmail = String(email ?? "").trim();
  if (normalizedEmail) {
    const localPart = normalizedEmail.split("@")[0]?.trim();
    if (localPart) {
      return localPart.replace(/[._-]+/g, " ").trim() || normalizedEmail;
    }
    return normalizedEmail;
  }

  return "Usuario sem nome";
}

async function listLookupRows(supabase: ApiSupabase, table: LookupTableName): Promise<LookupRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select("code, name, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "ACCESS_LOOKUP_FETCH_FAILED", "Falha ao carregar lookup de acesso.", {
      table,
      error
    });
  }

  return data ?? [];
}

async function resolveLookupCodeByHints(supabase: ApiSupabase, table: LookupTableName, hints: string[]) {
  const rows = await listLookupRows(supabase, table);
  const exactMatch = rows.find((row) => hints.some((hint) => normalizeLookupText(row.code) === normalizeLookupText(hint)));
  if (exactMatch) return exactMatch.code;

  const fuzzyMatch = rows.find((row) => matchesAnyHint(row.code, hints) || matchesAnyHint(row.name, hints));
  if (fuzzyMatch) return fuzzyMatch.code;

  throw new ApiHttpError(500, "ACCESS_LOOKUP_CODE_NOT_FOUND", "Nao foi possivel resolver um codigo de lookup obrigatorio.", {
    table,
    hints
  });
}

async function resolveRoleCode(supabase: ApiSupabase, role: AppRole) {
  return resolveLookupCodeByHints(supabase, "lookup_user_roles", ROLE_LOOKUP_HINTS[role]);
}

async function resolveApprovedStatusCode(supabase: ApiSupabase) {
  return resolveLookupCodeByHints(supabase, "lookup_user_statuses", APPROVED_STATUS_HINTS);
}

async function resolvePendingStatusCode(supabase: ApiSupabase) {
  return resolveLookupCodeByHints(supabase, "lookup_user_statuses", PENDING_STATUS_HINTS);
}

export function isApprovedAccessStatus(status: string | null | undefined) {
  return matchesAnyHint(status, APPROVED_STATUS_HINTS);
}

async function getProfileCount(supabase: ApiSupabase) {
  const { count, error } = await supabase.from("usuarios_acesso").select("id", { count: "exact", head: true });

  if (error) {
    throw new ApiHttpError(500, "ACCESS_PROFILE_COUNT_FAILED", "Falha ao contar perfis de acesso.", error);
  }

  return count ?? 0;
}

async function findProfileByAuthUserId(supabase: ApiSupabase, authUserId: string) {
  const { data, error } = await supabase
    .from("usuarios_acesso")
    .select(ACCESS_USER_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "ACCESS_PROFILE_LOOKUP_FAILED", "Falha ao carregar perfil por sessao.", error);
  }

  return data;
}

async function findUnlinkedProfileByEmail(supabase: ApiSupabase, email: string) {
  const { data, error } = await supabase
    .from("usuarios_acesso")
    .select(ACCESS_USER_SELECT)
    .is("auth_user_id", null)
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "ACCESS_PROFILE_LOOKUP_FAILED", "Falha ao carregar perfil por email.", error);
  }

  return data;
}

async function createAccessProfile(params: {
  supabase: ApiSupabase;
  authUserId: string;
  email: string | null;
  preferredName?: string | null;
}) {
  const isFirstProfile = (await getProfileCount(params.supabase)) === 0;
  const roleCode = await resolveRoleCode(params.supabase, isFirstProfile ? "ADMINISTRADOR" : "VENDEDOR");
  const statusCode = isFirstProfile
    ? await resolveApprovedStatusCode(params.supabase)
    : await resolvePendingStatusCode(params.supabase);
  const now = new Date().toISOString();

  const payload: Database["public"]["Tables"]["usuarios_acesso"]["Insert"] = {
    auth_user_id: params.authUserId,
    nome: buildFallbackName(params.email, params.preferredName),
    email: params.email,
    cargo: roleCode,
    status: statusCode,
    aprovado_em: isFirstProfile ? now : null
  };

  const { data, error } = await params.supabase
    .from("usuarios_acesso")
    .insert(payload)
    .select(ACCESS_USER_SELECT)
    .single();

  if (error) {
    throw new ApiHttpError(500, "ACCESS_PROFILE_CREATE_FAILED", "Falha ao provisionar perfil de acesso.", error);
  }

  return data;
}

export async function resolveAccessProfileForAuthUser(params: {
  supabase: ApiSupabase;
  authUserId: string;
  email: string | null;
  preferredName?: string | null;
}) {
  const linkedProfile = await findProfileByAuthUserId(params.supabase, params.authUserId);
  if (linkedProfile) {
    return linkedProfile;
  }

  if (params.email) {
    const emailProfile = await findUnlinkedProfileByEmail(params.supabase, params.email);
    if (emailProfile) {
      const updates: AccessUserUpdate = {
        auth_user_id: params.authUserId,
        email: params.email
      };
      if (!String(emailProfile.nome ?? "").trim()) {
        updates.nome = buildFallbackName(params.email, params.preferredName);
      }

      const { data, error } = await params.supabase
        .from("usuarios_acesso")
        .update(updates)
        .eq("id", emailProfile.id)
        .select(ACCESS_USER_SELECT)
        .single();

      if (error) {
        throw new ApiHttpError(500, "ACCESS_PROFILE_LINK_FAILED", "Falha ao vincular perfil existente ao usuario autenticado.", error);
      }

      return data;
    }
  }

  return createAccessProfile(params);
}

export async function touchAccessProfileLogin(supabase: ApiSupabase, profileId: string) {
  const { error } = await supabase
    .from("usuarios_acesso")
    .update({
      ultimo_login: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", profileId);

  if (error) {
    throw new ApiHttpError(500, "ACCESS_PROFILE_TOUCH_FAILED", "Falha ao atualizar ultimo login.", error);
  }
}

export async function listAdminAccessUsers(supabase: ApiSupabase): Promise<AdminAccessUser[]> {
  const { data, error } = await supabase
    .from("usuarios_acesso")
    .select(ACCESS_USER_SELECT)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiHttpError(500, "ACCESS_USERS_LIST_FAILED", "Falha ao listar usuarios de acesso.", error);
  }

  return (data ?? []) as AdminAccessUser[];
}

export async function listAdminAccessLookups(supabase: ApiSupabase): Promise<{
  roles: AccessLookupOption[];
  statuses: AccessLookupOption[];
}> {
  const [roles, statuses] = await Promise.all([
    listLookupRows(supabase, "lookup_user_roles"),
    listLookupRows(supabase, "lookup_user_statuses")
  ]);

  return {
    roles: roles.map((row) => ({ code: row.code, name: row.name })),
    statuses: statuses.map((row) => ({ code: row.code, name: row.name }))
  };
}

async function resolveIncomingRoleCode(supabase: ApiSupabase, rawRole: string) {
  const normalized = normalizeLookupText(rawRole);

  const exactAppRole = (["VENDEDOR", "SECRETARIO", "GERENTE", "ADMINISTRADOR"] as const).find(
    (role) => normalizeLookupText(role) === normalized
  );
  if (exactAppRole) {
    return resolveRoleCode(supabase, exactAppRole);
  }

  const roles = await listLookupRows(supabase, "lookup_user_roles");
  const match = roles.find((row) => normalizeLookupText(row.code) === normalized || normalizeLookupText(row.name) === normalized);
  if (match) return match.code;

  throw new ApiHttpError(400, "ACCESS_ROLE_INVALID", "Perfil de acesso invalido.", { role: rawRole });
}

async function resolveIncomingStatusCode(supabase: ApiSupabase, rawStatus: string) {
  const normalized = normalizeLookupText(rawStatus);
  const statuses = await listLookupRows(supabase, "lookup_user_statuses");
  const match = statuses.find((row) => normalizeLookupText(row.code) === normalized || normalizeLookupText(row.name) === normalized);
  if (match) return match.code;

  throw new ApiHttpError(400, "ACCESS_STATUS_INVALID", "Status de acesso invalido.", { status: rawStatus });
}

export async function updateAdminAccessUser(params: {
  supabase: ApiSupabase;
  userId: string;
  updates: {
    nome?: string;
    obs?: string | null;
    cargo?: string;
    status?: string;
  };
}) {
  const { data: current, error: currentError } = await params.supabase
    .from("usuarios_acesso")
    .select(ACCESS_USER_SELECT)
    .eq("id", params.userId)
    .maybeSingle();

  if (currentError) {
    throw new ApiHttpError(500, "ACCESS_USER_READ_FAILED", "Falha ao carregar usuario para atualizacao.", currentError);
  }

  if (!current) {
    throw new ApiHttpError(404, "ACCESS_USER_NOT_FOUND", "Usuario nao encontrado.");
  }

  const nextUpdate: AccessUserUpdate = {
    updated_at: new Date().toISOString()
  };

  if (params.updates.nome !== undefined) {
    const trimmedName = params.updates.nome.trim();
    if (!trimmedName) {
      throw new ApiHttpError(400, "ACCESS_NAME_REQUIRED", "O nome do usuario nao pode ficar vazio.");
    }
    nextUpdate.nome = trimmedName;
  }

  if (params.updates.obs !== undefined) {
    nextUpdate.obs = params.updates.obs?.trim() ? params.updates.obs.trim() : null;
  }

  if (params.updates.cargo !== undefined) {
    nextUpdate.cargo = await resolveIncomingRoleCode(params.supabase, params.updates.cargo);
  }

  if (params.updates.status !== undefined) {
    nextUpdate.status = await resolveIncomingStatusCode(params.supabase, params.updates.status);
    if (isApprovedAccessStatus(nextUpdate.status) && !current.aprovado_em) {
      nextUpdate.aprovado_em = new Date().toISOString();
    }
  }

  const { data, error } = await params.supabase
    .from("usuarios_acesso")
    .update(nextUpdate)
    .eq("id", params.userId)
    .select(ACCESS_USER_SELECT)
    .single();

  if (error) {
    throw new ApiHttpError(500, "ACCESS_USER_UPDATE_FAILED", "Falha ao atualizar usuario de acesso.", error);
  }

  return data as AdminAccessUser;
}
