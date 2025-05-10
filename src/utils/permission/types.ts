
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

/**
 * Safely converts a string to a UserRoleType if valid
 * @param role String representation of a role
 * @returns The role as a valid UserRoleType or null if invalid
 */
export const toUserRole = (role: string): UserRoleType | null => {
  const validRoles: UserRoleType[] = ['Usuário', 'Vendedor', 'Gerente', 'Administrador'];
  
  if (validRoles.includes(role as UserRoleType)) {
    return role as UserRoleType;
  }
  
  return null;
};
