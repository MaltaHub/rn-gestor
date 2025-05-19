
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea, UserRoleType } from "@/types/permission";
import { Database } from "@/integrations/supabase/types";
import { FeatureId } from "@/types/featurePermissions";

// Define the UserRole type to match the allowed values in the database
type UserRole = Database["public"]["Enums"]["user_role"] | "Usuário";
type ComponentType = "view_vehicles" | "edit-vehicle" | "change_user";

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

// Interface for the app's expected role permission format
export interface RolePermission {
  id: string;
  role: UserRole;
  area: AppArea;
  permission_level: number;
}

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

export interface RoleUpdateResult {
  success: boolean;
  message?: string;
}

export interface RolePermissions {
  inventory: number;
  vehicle_details: number;
  add_vehicle: number;
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

/* ----- PROFILE UTILITIES ----- */

/**
 * Creates or updates a user profile in Supabase
 * @param userId User ID to create profile for
 * @param name User's name
 * @param birthdate Optional birthdate
 */
export const createOrUpdateUserProfile = async (userId: string, name: string, birthdate?: string) => {
  try {
    // Check if profile already exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing profile:", checkError);
      toast.error("Error checking user profile");
      return false;
    }

    // Update or insert based on existence
    if (existingProfile) {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          name,
          birthdate: birthdate || null
        })
        .eq('id', userId);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        toast.error("Error updating user profile");
        return false;
      }
    } else {
      // Insert new profile
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name,
          role: 'Vendedor',
          birthdate: birthdate || null
        });

      if (insertError) {
        console.error("Error creating profile:", insertError);
        toast.error("Error creating user profile");
        return false;
      }
    }
    
    toast.success("Profile updated successfully");
    return true;
  } catch (error) {
    console.error("Error managing profile:", error);
    toast.error("Error managing user profile");
    return false;
  }
};

/**
 * Creates a minimal profile for a user if one doesn't exist
 * @param userId User ID to create minimal profile for
 * @param defaultName Default name to use
 * @returns True if successful, false otherwise
 */
export const createMinimalProfile = async (userId: string, defaultName: string): Promise<boolean> => {
  try {
    const { error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        role: 'Vendedor',
        name: defaultName // Added the required name field
      });
    
    if (insertError) {
      console.error("Error creating default profile:", insertError);
      toast.error("Error creating default profile");
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error creating minimal profile:", error);
    toast.error("Error creating minimal profile");
    return false;
  }
};

/**
 * Checks if a user profile is considered complete
 * A complete profile has name, birthdate, bio, avatarUrl and joinDate
 * @param profile User profile data
 * @returns True if profile is complete
 */
export const isProfileComplete = (profile: { 
  name?: string | null, 
  birthdate?: string | null,
  bio?: string | null,
  avatar_url?: string | null,
  join_date?: string | null 
}): boolean => {
  return Boolean(
    profile?.name && 
    profile?.birthdate && 
    profile?.bio &&
    profile?.avatar_url &&
    profile?.join_date
  );
};

/* ----- PERMISSION UTILITIES ----- */

/**
 * Default permission levels for users
 */
export const getDefaultPermissions = (): Record<AppArea, number> => ({
  inventory: 1, // Sempre garantir permissão de visualização do estoque
  vehicle_details: 1, // Todos podem ver detalhes do veículo
  add_vehicle: 0  // Por padrão, não podem adicionar veículos
});

/**
 * Fetches user profile and their permissions from Supabase
 * @param userId The ID of the user to fetch profile for
 * @returns Object containing profile data and permission levels
 */
export const fetchUserProfileAndPermissions = async (userId: string | undefined): Promise<ProfileResult> => {
  const defaultPermissions = getDefaultPermissions();

  if (!userId) {
    return {
      profileExists: false,
      userRole: null,
      permissionLevels: defaultPermissions,
    };
  }

  try {
    console.log("Fetching profile for user ID:", userId);
    
    // Get the current user's auth data to ensure we have the correct ID
    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error("Error getting authenticated user:", authError);
      return {
        profileExists: false,
        userRole: null,
        permissionLevels: defaultPermissions,
      };
    }

    // Confirm the user ID matches
    if (authData.user?.id !== userId) {
      console.warn("User ID mismatch. Using ID from auth:", authData.user?.id);
      userId = authData.user?.id;
    }

    // Fetch user profile
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, name, birthdate, bio, avatar_url, join_date')
      .eq('id', userId)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error("Error fetching profile:", profileError);
      toast.error("Error loading profile information");
      return {
        profileExists: false,
        userRole: null,
        permissionLevels: defaultPermissions,
      };
    }

    // Se o perfil não existir, criar um perfil padrão sem nome ou data de nascimento
    if (!profileData) {
      console.log("Profile not found, creating default minimal profile");
      
      // FIX: Add a default name to satisfy the required field constraint
      const defaultName = authData.user?.email?.split('@')[0] || 'Usuário';
      
      const success = await createMinimalProfile(userId, defaultName);
      
      if (!success) {
        return {
          profileExists: false,
          userRole: 'Usuário' as UserRole,
          permissionLevels: defaultPermissions,
        };
      }
      
      // Return with default values after successful creation of minimal profile
      return {
        profileExists: false, // Perfil existe mas está incompleto
        userRole: 'Usuário' as UserRole,
        permissionLevels: defaultPermissions,
      };
    }

    // O perfil existe, mas verificamos se tem todos os campos preenchidos
    if (profileData) {
      console.log("Profile found:", profileData);
      
      // Verificar se o perfil está completo (tem todos os campos requeridos)
      const profileComplete = isProfileComplete(profileData);
      
      // Fix: Cast the role to UserRole type to handle 'Usuário' case
      const role = profileData.role as UserRole;
      
      // Fix: Pass the role type safely to fetchPermissionLevels
      const permissionLevels = await fetchPermissionLevels(role, defaultPermissions);
      
      console.log("Permissões finais:", permissionLevels);
      console.log("Perfil completo:", profileComplete);
      
      return {
        profileExists: profileComplete, // Só consideramos perfil completo se tiver todos os campos
        userRole: role,
        permissionLevels
      };
    } else {
      console.log("No profile found, setting default role");
      return {
        profileExists: false,
        userRole: 'Usuário' as UserRole,
        permissionLevels: defaultPermissions,
      };
    }
  } catch (error) {
    console.error("Error checking permissions:", error);
    toast.error("Error checking permissions");
    return {
      profileExists: false,
      userRole: null,
      permissionLevels: defaultPermissions,
    };
  }
};

/**
 * Fetches permission levels for a specific role
 * @param role User role
 * @param defaultPermissions Default permissions to use as base
 * @returns Record with permission levels by area
 */
async function fetchPermissionLevels(
  role: UserRole,
  defaultPermissions: Record<AppArea, number>
): Promise<Record<AppArea, number>> {
  try {
    // Fetch permissions for this role
    const { data: permissionsData, error: permissionsError } = await supabase
      .from('role_permissions')
      .select('component, permission_level')
      .eq('position', role);

    if (permissionsError) {
      console.error("Error fetching permissions:", permissionsError);
      toast.error("Error loading permission information");
      return defaultPermissions;
    }

    // Map permissions by area
    const permissionLevels: Record<AppArea, number> = {
      ...defaultPermissions
    };
    
    if (permissionsData && Array.isArray(permissionsData)) {
      permissionsData.forEach(p => {
        if (p.component && p.permission_level !== undefined) {
          // Map component to area
          const area = componentToAreaMap[p.component as ComponentType];
          if (area) {
            permissionLevels[area] = p.permission_level;
          }
        }
      });
    }
    
    // Make sure inventory and vehicle_details have at least level 1
    permissionLevels.inventory = Math.max(permissionLevels.inventory, 1);
    permissionLevels.vehicle_details = Math.max(permissionLevels.vehicle_details, 1);
    
    // Vendedores agora podem editar veículos (nível 2 para inventory)
    if (role === 'Vendedor') {
      permissionLevels.inventory = Math.max(permissionLevels.inventory, 2);
    }

    // Usuários têm as mesmas permissões que Vendedores
    if (role === 'Usuário') {
      permissionLevels.inventory = Math.max(permissionLevels.inventory, 2);
      permissionLevels.vehicle_details = Math.max(permissionLevels.vehicle_details, 1);
    }
    
    return permissionLevels;
  } catch (error) {
    console.error("Error fetching permission levels:", error);
    return defaultPermissions;
  }
}

/* ----- ROLE MANAGEMENT UTILITIES ----- */

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
export function isValidRole(role: string): boolean {
  const validRoles: UserRole[] = ['Vendedor', 'Gerente', 'Administrador', 'Usuário'];
  return validRoles.includes(role as UserRole);
}

/**
 * Updates a user's role
 * @returns A result object indicating success/failure with an optional message
 */
export async function updateUserRole(
  userId: string, 
  newRole: UserRole | string
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
      .update({ role: newRole as UserRole })
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
    return (data as any[]).map(dbItem => ({
      id: dbItem.id,
      role: dbItem.position,
      area: componentToAreaMap[dbItem.component as ComponentType],
      permission_level: dbItem.permission_level
    }));
  } catch (error) {
    console.error('Error in getUserRolesWithPermissions:', error);
    toast.error('Erro ao obter cargos e permissões');
    throw error;
  }
}

/* ----- FEATURE PERMISSION UTILITIES ----- */

/**
 * Server-side validation for feature permissions
 * This function checks if the user has permission to access a specific feature
 */
export const validateFeaturePermission = async (
  userId: string | undefined, 
  featureId: FeatureId
): Promise<boolean> => {
  if (!userId) return false;
  
  try {
    const { data, error } = await supabase.rpc(
      'check_feature_permission',
      { 
        user_id: userId,
        feature_id: featureId
      }
    );
    
    if (error) {
      console.error('Error validating feature permission:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error('Error in validateFeaturePermission:', error);
    return false;
  }
};

/**
 * Higher-order function that wraps an operation with feature permission check
 * @param userId User ID to check permissions for
 * @param featureId Feature ID required for the operation
 * @param operation Function to execute if permission is granted
 * @param onDenied Function to execute if permission is denied
 * @returns Result of the operation or onDenied function
 */
export const withFeaturePermission = async <T>(
  userId: string | undefined,
  featureId: FeatureId,
  operation: () => Promise<T>,
  onDenied: () => T
): Promise<T> => {
  // Skip permission check if no user ID is provided
  if (!userId) {
    return onDenied();
  }
  
  try {
    // Check if user has permission for this feature
    const hasPermission = await validateFeaturePermission(userId, featureId);
    
    if (hasPermission) {
      // Execute the operation if permission is granted
      return await operation();
    } else {
      // Execute the onDenied callback if permission is denied
      return onDenied();
    }
  } catch (error) {
    console.error(`Error in withFeaturePermission for feature ${featureId}:`, error);
    return onDenied();
  }
};
