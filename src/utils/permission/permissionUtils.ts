
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea, UserRoleType } from "@/types/permission";
import { ProfileResult } from "./types";
import { createMinimalProfile, isProfileComplete } from "./profileUtils";
import { Database } from "@/integrations/supabase/types";
import { componentToAreaMap } from "@/services/permission/roleManagementService";

// Define the UserRole type to match the allowed values in the database
type UserRole = Database["public"]["Enums"]["user_role"] | "Usuário";
type ComponentType = "view_vehicles" | "edit-vehicle" | "change_user";

/**
 * Default permission levels for users
 */
const getDefaultPermissions = (): Record<AppArea, number> => ({
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
