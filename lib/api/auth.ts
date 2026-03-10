import type { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { hasRequiredRole, parseAppRole, type AppRole } from "@/lib/domain/access";
export type SupportedRole = AppRole;

export type ActorContext = {
  authUserId: string | null;
  role: SupportedRole;
  status: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
};

type UserProfile = {
  id: string;
  auth_user_id: string | null;
  cargo: string;
  email: string | null;
  nome: string;
  status: string;
};

function isDevelopmentHeaderFallbackAllowed() {
  return process.env.NODE_ENV !== "production";
}

function parseDevActorContext(req: NextRequest): ActorContext | null {
  if (!isDevelopmentHeaderFallbackAllowed()) return null;

  const role = parseAppRole(req.headers.get("x-user-role"));
  if (!role) {
    if (!req.headers.get("x-user-role")) return null;
    throw new ApiHttpError(403, "FORBIDDEN_ROLE", "Perfil de acesso invalido.", {
      role: req.headers.get("x-user-role")
    });
  }

  return {
    authUserId: null,
    role,
    status: "APROVADO",
    userId: req.headers.get("x-user-id"),
    userName: req.headers.get("x-user-name") ?? "api-user",
    userEmail: req.headers.get("x-user-email")
  };
}

function getBearerToken(req: NextRequest) {
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const [scheme, token] = raw.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

async function resolveProfile(authUserId: string, email: string | null): Promise<UserProfile | null> {
  const supabase = getSupabaseAdmin();

  const linkedProfile = await supabase
    .from("usuarios_acesso")
    .select("id, auth_user_id, cargo, email, nome, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (linkedProfile.error) {
    throw new ApiHttpError(500, "PROFILE_LOOKUP_FAILED", "Falha ao carregar perfil de acesso.", linkedProfile.error);
  }

  if (linkedProfile.data) {
    return linkedProfile.data;
  }

  if (!email) return null;

  const emailProfile = await supabase
    .from("usuarios_acesso")
    .select("id, auth_user_id, cargo, email, nome, status")
    .is("auth_user_id", null)
    .ilike("email", email)
    .maybeSingle();

  if (emailProfile.error) {
    throw new ApiHttpError(500, "PROFILE_LOOKUP_FAILED", "Falha ao carregar perfil de acesso.", emailProfile.error);
  }

  if (!emailProfile.data) return null;

  const linkedByEmail = await supabase
    .from("usuarios_acesso")
    .update({ auth_user_id: authUserId, email })
    .eq("id", emailProfile.data.id)
    .select("id, auth_user_id, cargo, email, nome, status")
    .single();

  if (linkedByEmail.error) {
    throw new ApiHttpError(500, "PROFILE_LINK_FAILED", "Falha ao vincular perfil ao usuario autenticado.", linkedByEmail.error);
  }

  return linkedByEmail.data;
}

export async function getActorContext(req: NextRequest): Promise<ActorContext> {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    const devActor = parseDevActorContext(req);
    if (devActor) return devActor;
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Sessao ausente.");
  }

  const supabase = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !authData.user) {
    throw new ApiHttpError(401, "INVALID_SESSION", "Sessao invalida ou expirada.", authError);
  }

  const profile = await resolveProfile(authData.user.id, authData.user.email ?? null);
  if (!profile) {
    throw new ApiHttpError(403, "PROFILE_NOT_FOUND", "Usuario autenticado sem perfil de acesso vinculado.");
  }

  const role = parseAppRole(profile.cargo);
  if (!role) {
    throw new ApiHttpError(403, "FORBIDDEN_ROLE", "Perfil de acesso invalido.", { role: profile.cargo });
  }

  if (String(profile.status).toUpperCase() !== "APROVADO") {
    throw new ApiHttpError(403, "ACCOUNT_NOT_APPROVED", "Conta sem aprovacao para operar no sistema.");
  }

  return {
    authUserId: authData.user.id,
    role,
    status: profile.status,
    userId: profile.id,
    userName: profile.nome,
    userEmail: profile.email ?? authData.user.email ?? null
  };
}

export function requireRole(actor: ActorContext, minRole: SupportedRole) {
  if (!hasRequiredRole(actor.role, minRole)) {
    throw new ApiHttpError(403, "FORBIDDEN", `Este endpoint exige perfil ${minRole}.`);
  }
}
