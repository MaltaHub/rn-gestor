
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Database } from "@/integrations/supabase/types";
import { AppArea } from "@/types/permission";
import { RoleUpdateResult } from "@/utils/permission/types";

// Match the actual database structure
type RolePosition = Database["public"]["Enums"]["user_role"];
export type ComponentType = "view_vehicles" | "edit-vehicle" | "change_user";

// Map component to AppArea for backwards compatibility
export const componentToAreaMap: Record<ComponentType, AppArea> = {
  "view_vehicles": "inventory",
  "edit-vehicle": "vehicle_details",
  "change_user": "add_vehicle"
};

// Map areas to components for database operations
export const areaToComponentMap: Record<AppArea, ComponentType> = {
  "inventory": "view_vehicles",
  "vehicle_details": "edit-vehicle",
  "add_vehicle": "change_user"
};

// Model to represent the structure in the database
interface RolePermissionDB {
  id: string;
  position: RolePosition;
  component: ComponentType;
  permission_level: number;
}

// Interface for the app's expected role permission format
export interface RolePermission {
  id: string;
  role: RolePosition;
  area: AppArea;
  permission_level: number;
}

/**
 * Fetches all user roles with their permissions from the database
 */
export async function getUserRolesWithPermissions(): Promise<RolePermission[]> {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*');

    if (error) {
      console.error('Error fetching role permissions:', error);
      toast.error('Erro ao obter permissões: ' + error.message);
      throw error;
    }

    // Convert from DB structure to app's expected format
    return (data as RolePermissionDB[]).map(dbItem => ({
      id: dbItem.id,
      role: dbItem.position,
      area: componentToAreaMap[dbItem.component],
      permission_level: dbItem.permission_level
    }));
  } catch (error) {
    console.error('Error in getUserRolesWithPermissions:', error);
    toast.error('Erro ao obter cargos e permissões');
    throw error;
  }
}

/**
 * Checks if a role can be edited by the current user role
 */
export function canEditRole(targetRole: string, currentUserRole: string): boolean {
  // Only Administrador can edit roles
  if (currentUserRole !== 'Administrador') return false;

  // Admin can't edit Gerente role
  if (targetRole === 'Gerente') return false;
  
  return true;
}

/**
 * Checks if a role can be deleted by the current user role
 */
export function canDeleteRole(targetRole: string, currentUserRole: string): boolean {
  // Only Administrador can delete roles
  if (currentUserRole !== 'Administrador') return false;
  
  // Standard roles cannot be deleted
  if (targetRole === 'Gerente' || targetRole === 'Usuário') return false;
  
  return true;
}

/**
 * Updates a user's role
 * @returns A result object indicating success/failure with an optional message
 */
export async function updateUserRole(
  userId: string, 
  newRole: RolePosition | string
): Promise<RoleUpdateResult> {
  try {
    // Validate the role type before updating
    if (!isValidRole(newRole)) {
      return {
        success: false,
        message: `Cargo inválido: ${newRole}`
      };
    }
    
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole as RolePosition })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user role:', error);
      return {
        success: false,
        message: 'Erro ao atualizar cargo: ' + error.message
      };
    }
    
    return {
      success: true,
      message: 'Cargo atualizado com sucesso'
    };
  } catch (error) {
    console.error('Error in updateUserRole:', error);
    return {
      success: false,
      message: 'Erro ao atualizar cargo do usuário'
    };
  }
}

/**
 * Checks if a user can change another user's role
 */
export function canChangeUserRole(targetUserRole: string, currentUserRole: string): boolean {
  // Only Administrador can change roles
  if (currentUserRole !== 'Administrador') return false;
  
  // Admin can't change Gerente role
  if (targetUserRole === 'Gerente') return false;
  
  return true;
}

/**
 * Helper function to validate if a string is a valid role
 */
function isValidRole(role: string): boolean {
  const validRoles: RolePosition[] = ['Vendedor', 'Gerente', 'Administrador', 'Usuário'];
  return validRoles.includes(role as RolePosition);
}
