
import { AppArea, UserRoleType } from "@/types/permission";

export interface ProfileResult {
  profileExists: boolean;
  userRole: string | null;
  permissionLevels: Record<AppArea, number>;
}

export interface UserProfile {
  role: UserRoleType | string;
  name: string | null;
  birthdate: string | null;
}
