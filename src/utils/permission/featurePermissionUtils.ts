
import { supabase } from "@/integrations/supabase/client";
import { FeatureId } from "@/types/featurePermissions";

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
