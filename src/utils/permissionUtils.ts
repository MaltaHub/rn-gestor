
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea } from "@/types/permission";

/**
 * Fetches user profile and their permissions from Supabase
 * @param userId The ID of the user to fetch profile for
 * @returns Object containing profile data and permission levels
 */
export const fetchUserProfileAndPermissions = async (userId: string | undefined) => {
  if (!userId) {
    return {
      profileExists: false,
      userRole: null,
      permissionLevels: {
        inventory: 0,
        vehicle_details: 0,
        add_vehicle: 0
      },
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
        permissionLevels: {
          inventory: 0,
          vehicle_details: 0,
          add_vehicle: 0
        },
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
        permissionLevels: {
          inventory: 0,
          vehicle_details: 0,
          add_vehicle: 0
        },
      };
    }

    if (profileData) {
      console.log("Profile found:", profileData);
      
      // Check if profile is complete
      const isProfileComplete = Boolean(profileData.name && profileData.birthdate);
      
      if (!isProfileComplete) {
        console.log("Profile incomplete, missing required data");
      }
      
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
        inventory: 0,
        vehicle_details: 0,
        add_vehicle: 0
      };
      
      if (permissionsData) {
        permissionsData.forEach(p => {
          if (p.area && p.permission_level !== undefined) {
            permissionLevels[p.area as AppArea] = p.permission_level;
          }
        });
      }
      
      return {
        profileExists: isProfileComplete,
        userRole: profileData.role,
        permissionLevels
      };
    } else {
      console.log("No profile found, setting default role");
      return {
        profileExists: false,
        userRole: 'Vendedor',
        permissionLevels: {
          inventory: 0,
          vehicle_details: 0,
          add_vehicle: 0
        },
      };
    }
  } catch (error) {
    console.error("Error checking permissions:", error);
    toast.error("Error checking permissions");
    return {
      profileExists: false,
      userRole: null,
      permissionLevels: {
        inventory: 0,
        vehicle_details: 0,
        add_vehicle: 0
      },
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
          role: 'Vendedor',
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
    
    toast.success("Profile completed successfully");
    return true;
  } catch (error) {
    console.error("Error managing profile:", error);
    toast.error("Error managing user profile");
    return false;
  }
};
