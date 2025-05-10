
import { AppArea } from "./permission";

// Feature IDs available in the system
export type FeatureId = 
  | 'view-inventory'
  | 'edit-vehicle'
  | 'delete-vehicle'
  | 'add-vehicle'
  | 'view-vehicle-details';

// Feature permission definition type
export interface FeaturePermission {
  featureId: FeatureId;
  area: AppArea;
  requiredLevel: number;
  description: string;
}

// Feature permissions context type
export interface FeaturePermissionsContextType {
  // Check if the user has permission for a specific feature
  hasFeaturePermission: (featureId: FeatureId) => boolean;
  
  // Check if the user has permission for a specific feature with a custom level
  checkFeaturePermission: (featureId: FeatureId, customLevel?: number) => boolean;
  
  // Get all available features
  availableFeatures: FeatureId[];
  
  // Loading state
  isLoading: boolean;
}
