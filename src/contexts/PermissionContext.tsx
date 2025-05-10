
import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea, PermissionContextType } from "@/types/permission";
import { fetchUserProfileAndPermissions, createOrUpdateUserProfile } from "@/utils/permissionUtils";

// Create the context
const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissionLevels, setPermissionLevels] = useState<Record<AppArea, number>>({
    inventory: 0,
    vehicle_details: 0,
    add_vehicle: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(false);

  // Function to create a user profile if it doesn't exist
  const createUserProfile = async (userId: string, name: string, birthdate?: string) => {
    try {
      const success = await createOrUpdateUserProfile(userId, name, birthdate);
      if (success) {
        // Reload permissions
        loadUserProfileAndPermissions();
      }
    } catch (error) {
      console.error("Error creating user profile:", error);
      toast.error("Error creating user profile");
    }
  };

  // Function to complete the profile of the logged-in user
  const completeUserProfile = async (name: string, birthdate: string) => {
    if (!user) return false;
    
    try {
      setIsLoading(true);
      
      // Get the current user to ensure we have the correct ID
      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authData.user) {
        console.error("Error getting authenticated user:", authError);
        toast.error("Error verifying authentication");
        return false;
      }
      
      const userId = authData.user.id;
      console.log("Completing profile for user ID:", userId);
      
      const success = await createOrUpdateUserProfile(userId, name, birthdate);
      if (success) {
        // Reload permissions after updating profile
        await loadUserProfileAndPermissions();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error completing profile:", error);
      toast.error("Error completing user profile");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Load user profile and permissions
  const loadUserProfileAndPermissions = async () => {
    if (!user) {
      setIsLoading(false);
      setProfileExists(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await fetchUserProfileAndPermissions(user.id);
      
      setProfileExists(result.profileExists);
      setUserRole(result.userRole);
      setPermissionLevels(result.permissionLevels);
    } finally {
      setIsLoading(false);
    }
  };

  // Load profile and permissions when user changes
  useEffect(() => {
    loadUserProfileAndPermissions();
  }, [user]);

  // Function to check if the user has sufficient permission for an area
  const checkPermission = (area: AppArea, requiredLevel: number): boolean => {
    if (!user || !profileExists) return false;
    return permissionLevels[area] >= requiredLevel;
  };

  return (
    <PermissionContext.Provider value={{ 
      userRole, 
      permissionLevels, 
      checkPermission, 
      isLoading,
      createUserProfile,
      completeUserProfile,
      profileExists
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

// Hook to use the permission context
export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return context;
};
