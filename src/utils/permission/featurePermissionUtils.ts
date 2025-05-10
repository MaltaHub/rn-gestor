
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
