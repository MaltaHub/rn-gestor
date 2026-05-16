import type { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import {
  isApprovedAccessStatus,
  resolveAccessProfileForAuthUser,
  touchAccessProfileLogin
} from "@/lib/api/access-users";
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

function isDevelopmentHeaderFallbackAllowed() {
  return process.env.NODE_ENV !== "production";
}

function parseDevActorContext(req: NextRequest): ActorContext | null {
  if (!isDevelopmentHeaderFallbackAllowed()) return null;

  const role = parseAppRole(req.headers.get("x-user-role"));
  const authUserId = req.headers.get("x-auth-user-id")?.trim() || null;
  if (!role) {
    if (!req.headers.get("x-user-role")) return null;
    throw new ApiHttpError(403, "FORBIDDEN_ROLE", "Perfil de acesso invalido.", {
      role: req.headers.get("x-user-role")
    });
  }

  return {
    authUserId,
    role,
    status: "APROVADO",
    userId: req.headers.get("x-user-id"),
    userName: req.headers.get("x-user-name") ?? "api-user",
    userEmail: req.headers.get("x-user-email")
  };
}

export function getBearerToken(req: NextRequest) {
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const [scheme, token] = raw.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

type AccessTokenClaims = {
  sub?: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  } | null;
};

export async function getActorContext(req: NextRequest): Promise<ActorContext> {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    const devActor = parseDevActorContext(req);
    if (devActor) return devActor;
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Sessao ausente.");
  }

  const supabase = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getClaims(accessToken);
  const claims = authData?.claims as AccessTokenClaims | undefined;
  const authUserId = typeof claims?.sub === "string" ? claims.sub : null;

  if (authError || !authUserId) {
    throw new ApiHttpError(401, "INVALID_SESSION", "Sessao invalida ou expirada.", authError);
  }

  const profile = await resolveAccessProfileForAuthUser({
    supabase,
    authUserId,
    email: claims?.email ?? null,
    preferredName: claims?.user_metadata?.full_name ?? claims?.user_metadata?.name ?? null
  });

  const role = parseAppRole(profile.cargo);
  if (!role) {
    throw new ApiHttpError(403, "FORBIDDEN_ROLE", "Perfil de acesso invalido.", { role: profile.cargo });
  }

  if (!isApprovedAccessStatus(profile.status)) {
    throw new ApiHttpError(403, "ACCOUNT_NOT_APPROVED", "Conta sem aprovacao para operar no sistema.", {
      status: profile.status
    });
  }

  await touchAccessProfileLogin(supabase, profile.id).catch(() => undefined);

  return {
    authUserId,
    role,
    status: profile.status,
    userId: profile.id,
    userName: profile.nome,
    userEmail: profile.email ?? claims?.email ?? null
  };
}

export function requireRole(actor: ActorContext, minRole: SupportedRole) {
  if (!hasRequiredRole(actor.role, minRole)) {
    throw new ApiHttpError(403, "FORBIDDEN", `Este endpoint exige perfil ${minRole}.`);
  }
}
