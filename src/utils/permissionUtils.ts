import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea } from "@/types/permission";

/**
 * Fetches user profile and their permissions from Supabase
 * @param userId The ID of the user to fetch profile for
 * @returns Object containing profile data and permission levels
 */
export const fetchUserProfileAndPermissions = async (userId: string | undefined) => {
  const defaultPermissions = {
    inventory: 1, // Sempre garantir permissão de visualização do estoque
    vehicle_details: 1, // Todos podem ver detalhes do veículo
    add_vehicle: 0,  // Por padrão, não podem adicionar veículos
    sales: 1, // Adicionando a área de vendas com nível padrão
  };

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

    // Confirm the user ID matches and fetch the authenticated user's profile
    userId = authData.user?.id;

    // Adicionar role_level ao perfil
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, name, birthdate, role_level') // Incluindo role_level
      .eq('id', userId) // Garantindo que o ID seja do usuário autenticado
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error("Error fetching profile:", profileError);
      toast.error("Error loading profile information");
      return {
        profileExists: false,
        userRole: null,
        permissionLevels: defaultPermissions,
        roleLevel: null, // Adicionar roleLevel como null em caso de erro
      };
    }

    if (profileData) {
      console.warn("Profile found:", profileData);
      console.log("Role level fetched:", profileData.role_level); // Log para verificar o role_level

      // Fetch permissions for this role
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('role_permissions')
        .select('components, permission_level')
        .eq('role', profileData.role);

      if (permissionsError) {
        console.error("Error fetching permissions:", permissionsError);
        toast.error("Error loading permissions");
        return {
          profileExists: true,
          userRole: profileData.role,
          permissionLevels: defaultPermissions,
          roleLevel: profileData.role_level || null,
        };
      }

      if (!permissionsData) {
        console.error("Permissions data is null or undefined.");
        return {
          profileExists: true,
          userRole: profileData.role,
          permissionLevels: defaultPermissions,
          roleLevel: profileData.role_level || null,
        };
      }

      const permissionLevels: Record<AppArea, number> = permissionsData.reduce((acc, permission) => {
        (permission.components as string[]).forEach((component) => {
          acc[component as AppArea] = permission.permission_level;
        });
        return acc;
      }, { ...defaultPermissions });

      return {
        profileExists: true,
        userRole: profileData.role,
        permissionLevels,
        roleLevel: profileData.role_level ?? null, // Garantir que roleLevel seja atribuído corretamente
      };
    } else {
      console.log("No profile found, setting default role");
      return {
        profileExists: false,
        userRole: 'Consultor',
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
          role: 'Consultor',
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
