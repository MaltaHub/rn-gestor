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
    add_vehicle: 0  // Por padrão, não podem adicionar veículos
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

    // Confirm the user ID matches
    if (authData.user?.id !== userId) {
      console.warn("User ID mismatch. Using ID from auth:", authData.user?.id);
      userId = authData.user?.id;
    }

    // Fetch user profile
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, name, birthdate')
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
        return {
          profileExists: false,
          userRole: 'Vendedor', // Default role
          permissionLevels: defaultPermissions,
        };
      }
      
      // Return with default values after successful creation of minimal profile
      return {
        profileExists: false, // Perfil existe mas está incompleto
        userRole: 'Vendedor',
        permissionLevels: defaultPermissions,
      };
    }

    // O perfil existe, mas verificamos se tem nome e data de nascimento
    if (profileData) {
      console.log("Profile found:", profileData);
      
      // Verificar se o perfil está completo (tem nome e data de nascimento)
      // Um perfil completo DEVE ter nome E data de nascimento preenchidos
      const isProfileComplete = Boolean(profileData.name && profileData.birthdate);
      
      // Fetch permissions for this role
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('role_permissions')
        .select('area, permission_level')
        .eq('role', profileData.role);

      if (permissionsError) {
        console.error("Error fetching permissions:", permissionsError);
        toast.error("Error loading permission information");
      }

      // Map permissions by area
      const permissionLevels: Record<AppArea, number> = {
        ...defaultPermissions
      };
      
      if (permissionsData) {
        permissionsData.forEach(p => {
          if (p.area && p.permission_level !== undefined) {
            permissionLevels[p.area as AppArea] = p.permission_level;
          }
        });
      }
      
      // Make sure inventory and vehicle_details have at least level 1
      permissionLevels.inventory = Math.max(permissionLevels.inventory, 1);
      permissionLevels.vehicle_details = Math.max(permissionLevels.vehicle_details, 1);
      
      console.log("Permissões finais:", permissionLevels);
      
      return {
        profileExists: isProfileComplete, // Só consideramos perfil completo se tiver nome e data
        userRole: profileData.role,
        permissionLevels
      };
    } else {
      console.log("No profile found, setting default role");
      return {
        profileExists: false,
        userRole: 'Vendedor',
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
