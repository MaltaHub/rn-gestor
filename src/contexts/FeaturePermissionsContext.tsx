
import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/contexts/PermissionContext";
import { FeatureId, FeaturePermission, FeaturePermissionsContextType } from "@/types/featurePermissions";
// Rename the imported hook to avoid name collision
import { useFeaturePermissions as useFeaturePermissionsData } from "@/hooks/usePermission";

// Create the Feature Permissions Context
const FeaturePermissionsContext = createContext<FeaturePermissionsContextType | undefined>(undefined);

export const FeaturePermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { permissionLevels } = usePermission();
  // Use the renamed imported hook
  const { featurePermissions, isLoading } = useFeaturePermissionsData();
  const [availableFeatures, setAvailableFeatures] = useState<FeatureId[]>([]);

  // Update available features whenever permissions change
  useEffect(() => {
    if (featurePermissions && !isLoading) {
      const allowedFeatures = featurePermissions
        .filter(feature => {
          // Get the user's permission level for this area
          const userLevel = permissionLevels[feature.area] || 0;
          // Check if user has sufficient permission
          return userLevel >= feature.requiredLevel;
        })
        .map(feature => feature.featureId);
      
      setAvailableFeatures(allowedFeatures);
    }
  }, [featurePermissions, permissionLevels, isLoading]);

  // Check if user has permission for a specific feature
  const hasFeaturePermission = (featureId: FeatureId): boolean => {
    if (!user) return false;
    
    return availableFeatures.includes(featureId);
  };

  // Check permission with custom level requirement
  const checkFeaturePermission = (
    featureId: FeatureId, 
    customLevel?: number
  ): boolean => {
    if (!user) return false;
    
    const featurePermission = featurePermissions?.find(
      fp => fp.featureId === featureId
    );
    
    if (!featurePermission) return false;
    
    const requiredLevel = customLevel !== undefined 
      ? customLevel 
      : featurePermission.requiredLevel;
    
    const userLevel = permissionLevels[featurePermission.area] || 0;
    
    return userLevel >= requiredLevel;
  };

  return (
    <FeaturePermissionsContext.Provider 
      value={{ 
        hasFeaturePermission, 
        checkFeaturePermission,
        availableFeatures,
        isLoading
      }}
    >
      {children}
    </FeaturePermissionsContext.Provider>
  );
};

// Hook to use the feature permissions context
export const useFeaturePermissions = () => {
  const context = useContext(FeaturePermissionsContext);
  
  if (context === undefined) {
    throw new Error("useFeaturePermissions must be used within a FeaturePermissionsProvider");
  }
  
  return context;
};
