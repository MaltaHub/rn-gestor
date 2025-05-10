
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

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
