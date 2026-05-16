import type { AppRole } from "@/lib/domain/access";

export type Role = AppRole;

export type CurrentActor = {
  authUserId: string | null;
  role: Role;
  status: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
};

export type SessionStatus = "loading" | "signed_out" | "ready" | "profile_error";

export type RequestAuth = {
  accessToken: string | null;
  devRole?: Role | null;
};

export const DEV_ACTOR_AUTH_USER_IDS = {
  VENDEDOR: "11111111-1111-4111-8111-111111111111",
  SECRETARIO: "22222222-2222-4222-8222-222222222222",
  GERENTE: "33333333-3333-4333-8333-333333333333",
  ADMINISTRADOR: "44444444-4444-4444-8444-444444444444"
} satisfies Record<Role, string>;

export function getDevActorAuthUserId(role: Role) {
  return DEV_ACTOR_AUTH_USER_IDS[role];
}
