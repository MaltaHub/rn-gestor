
import { supabase } from "@/integrations/supabase/client";
import { FeatureId } from "@/types/featurePermissions";

/**
 * Validates if the user has permission for a specific feature on the backend
 * This is useful for critical operations that need server-side validation
 * @param userId User ID to check permissions for
 * @param featureId Feature ID to validate
 * @returns Boolean indicating if the user has permission
 */
export const validateFeaturePermission = async (
  userId: string, 
  featureId: FeatureId
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc(
      'check_feature_permission',
      { 
        user_id: userId,
        feature_id: featureId
      }
    );
    
    if (error) {
      console.error("Error validating feature permission:", error);
      return false;
    }
    
    return data || false;
  } catch (error) {
    console.error("Error in feature permission validation:", error);
    return false;
  }
};

/**
 * Middleware function to validate feature permission before executing an action
 * @param userId User ID to check permissions for
 * @param featureId Feature ID to validate
 * @param action Function to execute if permission is granted
 * @param onDenied Function to execute if permission is denied (optional)
 * @returns Promise resolving to the action result or undefined if permission denied
 */
export const withFeaturePermission = async <T>(
  userId: string,
  featureId: FeatureId,
  action: () => Promise<T>,
  onDenied?: () => void
): Promise<T | undefined> => {
  const hasPermission = await validateFeaturePermission(userId, featureId);
  
  if (hasPermission) {
    return action();
  } else {
    if (onDenied) {
      onDenied();
    }
    return undefined;
  }
};
