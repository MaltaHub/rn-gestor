import type { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";

export const ROLE_ORDER = ["VENDEDOR", "SECRETARIO", "GERENTE", "ADMINISTRADOR"] as const;

export type SupportedRole = (typeof ROLE_ORDER)[number];

export type ActorContext = {
  role: SupportedRole;
  userId: string | null;
  userName: string;
  userEmail: string | null;
};

export function getActorContext(req: NextRequest): ActorContext {
  const role = String(req.headers.get("x-user-role") ?? "VENDEDOR").toUpperCase() as SupportedRole;
  const userName = req.headers.get("x-user-name") ?? "api-user";

  if (!ROLE_ORDER.includes(role)) {
    throw new ApiHttpError(403, "FORBIDDEN_ROLE", "Perfil de acesso invalido.", { role });
  }

  return {
    role,
    userId: req.headers.get("x-user-id"),
    userName,
    userEmail: req.headers.get("x-user-email")
  };
}

export function requireRole(actor: ActorContext, minRole: SupportedRole) {
  const actorLevel = ROLE_ORDER.indexOf(actor.role);
  const minLevel = ROLE_ORDER.indexOf(minRole);

  if (actorLevel < minLevel) {
    throw new ApiHttpError(403, "FORBIDDEN", `Este endpoint exige perfil ${minRole}.`);
  }
}
