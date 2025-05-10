
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFeaturePermissionsData } from '@/hooks/useFeaturePermissions';
import { usePermission } from './PermissionContext';
import { FeatureId, FeaturePermission, FeaturePermissionsContextType } from '@/types/featurePermissions';

// Create the context
const FeaturePermissionsContext = createContext<FeaturePermissionsContextType | undefined>(undefined);

export const FeaturePermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { featurePermissions, isLoading: featuresLoading } = useFeaturePermissionsData();
  const { checkPermission, isLoading: permissionsLoading } = usePermission();
  const [availableFeatures, setAvailableFeatures] = useState<FeatureId[]>([]);

  const isLoading = featuresLoading || permissionsLoading;

  // Check if the user has permission for a specific feature
  const hasFeaturePermission = (featureId: FeatureId): boolean => {
    if (isLoading) return false;
    
    const feature = featurePermissions.find(f => f.featureId === featureId);
    if (!feature) return false;
    
    return checkPermission(feature.area, feature.requiredLevel);
  };

  // Check feature permission with a custom level (useful for dynamic permission checks)
  const checkFeaturePermission = (featureId: FeatureId, customLevel?: number): boolean => {
    if (isLoading) return false;
    
    const feature = featurePermissions.find(f => f.featureId === featureId);
    if (!feature) return false;
    
    // If a custom level is provided, use it instead of the default
    const requiredLevel = customLevel !== undefined ? customLevel : feature.requiredLevel;
    
    return checkPermission(feature.area, requiredLevel);
  };

  // Update the list of available features based on the user's permissions
  useEffect(() => {
    if (!isLoading) {
      const available = featurePermissions
        .filter(feature => checkPermission(feature.area, feature.requiredLevel))
        .map(feature => feature.featureId);
      
      setAvailableFeatures(available);
    }
  }, [featurePermissions, isLoading]);

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
