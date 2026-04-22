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
